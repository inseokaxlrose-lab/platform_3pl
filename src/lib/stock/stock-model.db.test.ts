import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { prisma } from '@/lib/prisma'
import { withStockWrite } from '@/lib/stock/stock-write-guard'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'

// 재고·재고 이력 DB 규칙 (docs/decisions/0044) — 재고 변경 함수가 실수해도 DB가 마지막에 막는다
// (여기서는 규칙 확인을 위해 쓰기 허가증 withStockWrite로 표에 직접 쓴다. 실제 코드는 재고 변경 공통 함수로만 바꾼다)

let address: {
  operatorId: bigint
  centerId: bigint
  warehouseId: bigint
  locationId: bigint
  shipperId: bigint
  itemId: bigint
}

beforeEach(async () => {
  await resetDatabase()
  const center = await createTestCenter('ICN')
  const warehouse = await ensureCenterDefaults(prisma, center.id)
  const location = await prisma.location.findFirstOrThrow({ where: { warehouseId: warehouse.id } })
  const shipper = await createTestShipper('GANA')
  const unit = await prisma.unit.create({
    data: { operatorId: TEST_OPERATOR_ID, code: 'EA', name: '개', kind: 'BASE' },
  })
  const item = await prisma.item.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      shipperId: shipper.id,
      systemCode: 'IT-T-1',
      code: 'SKU1',
      name: '생수',
      baseUnitId: unit.id,
    },
  })
  address = {
    operatorId: TEST_OPERATOR_ID,
    centerId: center.id,
    warehouseId: warehouse.id,
    locationId: location.id,
    shipperId: shipper.id,
    itemId: item.id,
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

const stock = (data: Record<string, unknown> = {}) =>
  withStockWrite(() => prisma.stock.create({ data: { ...address, qty: '10', ...data } }))

const txn = (stockId: bigint, data: Record<string, unknown> = {}) =>
  withStockWrite(() =>
    prisma.stockTxn.create({
      data: {
        ...address,
        stockId,
        type: 'RECEIVE',
        qtyChange: '10',
        qtyAfter: '10',
        ...data,
      },
    }),
  )

describe('재고 주소는 한 줄', () => {
  it('로트·유통기한이 비어 있어도 같은 주소는 두 줄이 될 수 없다 (NULLS NOT DISTINCT)', async () => {
    await stock()
    await expect(stock()).rejects.toThrow()
  })

  it('로트·유통기한이 다르면 다른 주소', async () => {
    await stock({ lotNo: 'L1', expiryOn: new Date('2027-01-31') })
    await stock({ lotNo: 'L2', expiryOn: new Date('2027-01-31') })
    await stock({ lotNo: 'L1', expiryOn: new Date('2027-02-28') })
    await expect(stock({ lotNo: 'L1', expiryOn: new Date('2027-01-31') })).rejects.toThrow()
    expect(await prisma.stock.count()).toBe(3)
  })
})

describe('수량 규칙 (DB 검사 조건)', () => {
  it('수량은 0 이상, 할당은 0 이상·수량 이하, 로트번호 빈 글자 금지', async () => {
    await expect(stock({ qty: '-1' })).rejects.toThrow()
    await expect(stock({ qty: '5', allocatedQty: '6' })).rejects.toThrow()
    await expect(stock({ allocatedQty: '-1' })).rejects.toThrow()
    await expect(stock({ lotNo: '' })).rejects.toThrow()
    const ok = await stock({ qty: '5', allocatedQty: '5' })
    expect(ok.qty.toString()).toBe('5')
    // 수량을 할당보다 작게 줄일 수 없다
    await expect(
      withStockWrite(() => prisma.stock.update({ where: { id: ok.id }, data: { qty: '4' } })),
    ).rejects.toThrow()
  })
})

describe('재고 이력', () => {
  it('변동 수량은 0이 아니고, 변동 후 수량은 0 이상, 조정은 사유 필수', async () => {
    const s = await stock()
    await expect(txn(s.id, { qtyChange: '0' })).rejects.toThrow()
    await expect(txn(s.id, { qtyAfter: '-1' })).rejects.toThrow()
    await expect(txn(s.id, { type: 'ADJUST', qtyChange: '-1', qtyAfter: '9' })).rejects.toThrow()
    await expect(
      txn(s.id, { type: 'ADJUST', qtyChange: '-1', qtyAfter: '9', reason: '' }),
    ).rejects.toThrow()
    expect(
      (await txn(s.id, { type: 'ADJUST', qtyChange: '-1', qtyAfter: '9', reason: '파손' })).reason,
    ).toBe('파손')
  })

  it('고치거나 지울 수 없다 (DB 트리거)', async () => {
    const s = await stock()
    const t = await txn(s.id)
    await expect(
      withStockWrite(() =>
        prisma.stockTxn.update({ where: { id: t.id }, data: { reason: '바꿈' } }),
      ),
    ).rejects.toThrow('재고 이력은 고치거나 지울 수 없습니다')
    await expect(
      withStockWrite(() => prisma.stockTxn.delete({ where: { id: t.id } })),
    ).rejects.toThrow('재고 이력은 고치거나 지울 수 없습니다')
    expect(await prisma.stockTxn.count()).toBe(1)
  })

  it('이력이 있는 재고 줄은 지울 수 없다 (이력이 가리킨다)', async () => {
    const s = await stock()
    await txn(s.id)
    await expect(
      withStockWrite(() => prisma.stock.delete({ where: { id: s.id } })),
    ).rejects.toThrow()
  })
})

describe('재고 표는 재고 변경 공통 함수 밖에서 바꿀 수 없다 (Prisma 확장, 0045)', () => {
  it('허가증 없이 등록·수정·삭제하면 DB에 가기 전에 오류, 읽기는 된다', async () => {
    const s = await stock()
    const blocked = '재고 변경 공통 함수'
    await expect(prisma.stock.create({ data: { ...address, lotNo: 'X' } })).rejects.toThrow(blocked)
    await expect(prisma.stock.update({ where: { id: s.id }, data: { qty: '1' } })).rejects.toThrow(
      blocked,
    )
    await expect(prisma.stock.updateMany({ data: { qty: '1' } })).rejects.toThrow(blocked)
    await expect(
      prisma.stock.upsert({ where: { id: s.id }, create: { ...address }, update: { qty: '1' } }),
    ).rejects.toThrow(blocked)
    await expect(prisma.stock.deleteMany({})).rejects.toThrow(blocked)
    await expect(
      prisma.stockTxn.create({
        data: { ...address, stockId: s.id, type: 'RECEIVE', qtyChange: '1', qtyAfter: '11' },
      }),
    ).rejects.toThrow(blocked)
    expect((await prisma.stock.findUniqueOrThrow({ where: { id: s.id } })).qty.toString()).toBe(
      '10',
    )
  })
})
