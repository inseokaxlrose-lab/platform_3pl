import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runInContext } from '@/lib/actor'
import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { findUsedItemIds } from '@/lib/items/items'
import { findUsedLocationIds } from '@/lib/locations/locations'
import { prisma, type Tx } from '@/lib/prisma'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { adjustStock, moveStock, receiveStock } from './stock-change'
import { withStockWrite } from './stock-write-guard'

// 재고 변경 공통 함수 (docs/decisions/0045)
// 예: 이천센터(ICN) / 입고대기 창고 DEFAULT 로케이션 + 일반 창고 A-01·A-02 / 화주사 가나
//     품목 생수(EA, 정수) · 우유(EA, 로트·유통기한 관리) · 쌀(KG, 소수 3자리)

let ids: {
  staging: bigint // 입고대기 DEFAULT
  a01: bigint
  a02: bigint
  gmhStaging: bigint // 김해센터 (가나는 이용하지 않음)
  water: bigint
  milk: bigint
  rice: bigint
}

beforeEach(async () => {
  await resetDatabase()
  const icn = await createTestCenter('ICN', { name: '이천센터' })
  const gmh = await createTestCenter('GMH', { name: '김해센터' })
  const inbound = await ensureCenterDefaults(prisma, icn.id)
  const gmhInbound = await ensureCenterDefaults(prisma, gmh.id)
  const general = await prisma.warehouse.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      centerId: icn.id,
      systemCode: 'WH-T-GEN',
      code: 'GEN',
      name: '일반창고',
      tempZone: 'AMBIENT',
    },
  })
  const location = (warehouseId: bigint, code: string) =>
    prisma.location.create({
      data: { operatorId: TEST_OPERATOR_ID, warehouseId, code, name: code },
    })
  const firstLocation = (warehouseId: bigint) =>
    prisma.location.findFirstOrThrow({ where: { warehouseId } })

  const shipper = await createTestShipper('GANA')
  await prisma.shipper.update({
    where: { id: shipper.id },
    data: { centers: { create: [{ centerId: icn.id }] } },
  })
  const unit = (code: string, decimals: number) =>
    prisma.unit.create({
      data: { operatorId: TEST_OPERATOR_ID, code, name: code, kind: 'BASE', decimals },
    })
  const ea = await unit('EA', 0)
  const kg = await unit('KG', 3)
  const item = (code: string, baseUnitId: bigint, data: Record<string, unknown> = {}) =>
    prisma.item.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        shipperId: shipper.id,
        systemCode: `IT-T-${code}`,
        code,
        name: code,
        baseUnitId,
        ...data,
      },
    })

  ids = {
    staging: (await firstLocation(inbound.id)).id,
    a01: (await location(general.id, 'A-01')).id,
    a02: (await location(general.id, 'A-02')).id,
    gmhStaging: (await firstLocation(gmhInbound.id)).id,
    water: (await item('WATER', ea.id)).id,
    milk: (await item('MILK', ea.id, { useLot: 'Y', useExpiry: 'Y' })).id,
    rice: (await item('RICE', kg.id)).id,
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// 서버 액션처럼: 작업자 kim, 테스트 운영사 출입증 + 트랜잭션
const run = <T>(fn: (tx: Tx) => Promise<T>, operatorId = TEST_OPERATOR_ID) =>
  runInContext({ actor: 'kim', operatorId }, () => prisma.$transaction(fn))

const qtyAt = async (locationId: bigint, itemId: bigint) => {
  const rows = await prisma.stock.findMany({ where: { locationId, itemId } })
  return rows.map((r) => r.qty.toString())
}

describe('입고 (receiveStock)', () => {
  it('재고 줄을 만들고 RECEIVE 이력 한 줄, 센터·창고·화주사·운영사·작업자·원본 문서 자동', async () => {
    const result = await run((tx) =>
      receiveStock(tx, {
        address: { locationId: ids.staging, itemId: ids.water },
        qty: '100',
        ref: { refType: 'RECEIPT', refId: 7n, refNo: 'RC-0007' },
      }),
    )
    expect(result.qtyAfter).toBe('100')
    const stock = await prisma.stock.findUniqueOrThrow({ where: { id: result.stockId } })
    const txn = await prisma.stockTxn.findUniqueOrThrow({ where: { id: result.txnId } })
    expect(stock).toMatchObject({ operatorId: TEST_OPERATOR_ID, lotNo: null, expiryOn: null })
    expect(txn).toMatchObject({
      type: 'RECEIVE',
      stockId: stock.id,
      centerId: stock.centerId,
      warehouseId: stock.warehouseId,
      shipperId: stock.shipperId,
      refType: 'RECEIPT',
      refId: 7n,
      refNo: 'RC-0007',
      createdBy: 'kim',
      groupId: null,
    })
    expect([txn.qtyChange.toString(), txn.qtyAfter.toString()]).toEqual(['100', '100'])
  })

  it('같은 주소면 같은 줄에 더한다 (로트·유통기한이 비어 있어도)', async () => {
    const address = { locationId: ids.staging, itemId: ids.water }
    await run((tx) => receiveStock(tx, { address, qty: '100' }))
    const second = await run((tx) => receiveStock(tx, { address, qty: '20' }))
    expect(second.qtyAfter).toBe('120')
    expect(await qtyAt(ids.staging, ids.water)).toEqual(['120'])
  })

  it('수량은 0보다 커야 하고, 기본단위 소수 자리를 지킨다 (EA 정수, KG 3자리)', async () => {
    const water = { locationId: ids.staging, itemId: ids.water }
    const rice = { locationId: ids.staging, itemId: ids.rice }
    for (const qty of ['0', '-1']) {
      await expect(run((tx) => receiveStock(tx, { address: water, qty }))).rejects.toMatchObject({
        code: 'VALIDATION',
      })
    }
    await expect(run((tx) => receiveStock(tx, { address: water, qty: '2.5' }))).rejects.toThrow(
      '정수만',
    )
    await expect(run((tx) => receiveStock(tx, { address: water, qty: 'abc' }))).rejects.toThrow(
      '수량 형식',
    )
    expect((await run((tx) => receiveStock(tx, { address: rice, qty: '2.125' }))).qtyAfter).toBe(
      '2.125',
    )
    await expect(run((tx) => receiveStock(tx, { address: rice, qty: '0.0005' }))).rejects.toThrow(
      '소수 3자리',
    )
  })
})

describe('로트·유통기한은 품목 설정에 따름', () => {
  it('관리 품목은 둘 다 필수, 관리하지 않는 품목은 넣으면 거부', async () => {
    const milk = (lotNo: string | null, expiryOn: string | null) =>
      run((tx) =>
        receiveStock(tx, {
          address: { locationId: ids.staging, itemId: ids.milk, lotNo, expiryOn },
          qty: '10',
        }),
      )
    await expect(milk(null, '2027-01-31')).rejects.toThrow('로트번호를 넣어')
    await expect(milk('  ', '2027-01-31')).rejects.toThrow('로트번호를 넣어')
    await expect(milk('L1', null)).rejects.toThrow('유통기한을 넣어')
    await expect(milk('L1', '2027-02-30')).rejects.toThrow('유통기한 형식')
    await milk(' L1 ', '2027-01-31')
    await milk('L2', '2027-01-31')
    const rows = await prisma.stock.findMany({
      where: { itemId: ids.milk },
      orderBy: { lotNo: 'asc' },
    })
    expect(rows.map((r) => [r.lotNo, r.expiryOn?.toISOString().slice(0, 10)])).toEqual([
      ['L1', '2027-01-31'],
      ['L2', '2027-01-31'],
    ])

    const water = (lotNo: string | null, expiryOn: string | null) =>
      run((tx) =>
        receiveStock(tx, {
          address: { locationId: ids.staging, itemId: ids.water, lotNo, expiryOn },
          qty: '1',
        }),
      )
    await expect(water('L1', null)).rejects.toThrow('로트를 관리하지 않는')
    await expect(water(null, '2027-01-31')).rejects.toThrow('유통기한을 관리하지 않는')
  })
})

describe('이동 (moveStock)', () => {
  it('나감·들어옴 두 줄, 같은 묶음 번호(= 나감 줄의 키), 로트·유통기한은 그대로', async () => {
    const from = { locationId: ids.staging, itemId: ids.milk, lotNo: 'L1', expiryOn: '2027-01-31' }
    await run((tx) => receiveStock(tx, { address: from, qty: '10' }))
    const moved = await run((tx) =>
      moveStock(tx, { from, toLocationId: ids.a01, qty: '4', ref: { refType: 'PUTAWAY' } }),
    )
    expect(moved.groupId).toBe(moved.out.txnId)
    expect([moved.out.qtyAfter, moved.in.qtyAfter]).toEqual(['6', '4'])
    const txns = await prisma.stockTxn.findMany({
      where: { groupId: moved.groupId },
      orderBy: { id: 'asc' },
    })
    expect(txns.map((t) => [t.type, t.qtyChange.toString(), t.lotNo, t.refType])).toEqual([
      ['MOVE_OUT', '-4', 'L1', 'PUTAWAY'],
      ['MOVE_IN', '4', 'L1', 'PUTAWAY'],
    ])
    const dest = await prisma.stock.findUniqueOrThrow({ where: { id: moved.in.stockId } })
    expect(dest.expiryOn?.toISOString().slice(0, 10)).toBe('2027-01-31')
  })

  it('부족하면 거부(출발 재고 없음 포함), 같은 로케이션·다른 센터로는 옮길 수 없다', async () => {
    const from = { locationId: ids.staging, itemId: ids.water }
    await expect(
      run((tx) => moveStock(tx, { from, toLocationId: ids.a01, qty: '1' })),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('재고가 부족') })
    // 실패한 이동은 도착 줄도 남기지 않는다 (트랜잭션 취소)
    expect(await prisma.stock.count()).toBe(0)

    await run((tx) => receiveStock(tx, { address: from, qty: '5' }))
    await expect(
      run((tx) => moveStock(tx, { from, toLocationId: ids.a01, qty: '6' })),
    ).rejects.toThrow('재고가 부족')
    await expect(
      run((tx) => moveStock(tx, { from, toLocationId: ids.staging, qty: '1' })),
    ).rejects.toThrow('같은 로케이션')
    await expect(
      run((tx) => moveStock(tx, { from, toLocationId: ids.gmhStaging, qty: '1' })),
    ).rejects.toThrow('다른 센터')
    expect(await qtyAt(ids.staging, ids.water)).toEqual(['5'])
  })
})

describe('조정 (adjustStock)', () => {
  const address = () => ({ locationId: ids.a01, itemId: ids.water })

  it('사유 필수, 늘리기·줄이기, 0은 거부', async () => {
    await expect(
      run((tx) => adjustStock(tx, { address: address(), qty: '5', reason: '  ' })),
    ).rejects.toThrow('사유')
    await expect(
      run((tx) => adjustStock(tx, { address: address(), qty: '0', reason: '실사' })),
    ).rejects.toThrow('0이 아니어야')
    await run((tx) => adjustStock(tx, { address: address(), qty: '5', reason: '실사 차이' }))
    const down = await run((tx) =>
      adjustStock(tx, { address: address(), qty: '-2', reason: '파손' }),
    )
    expect(down.qtyAfter).toBe('3')
    const txn = await prisma.stockTxn.findUniqueOrThrow({ where: { id: down.txnId } })
    expect([txn.type, txn.qtyChange.toString(), txn.reason]).toEqual(['ADJUST', '-2', '파손'])
  })

  it('줄이기는 할당되지 않은 수량까지만 (수량 10, 할당 7 → 3까지)', async () => {
    const { stockId } = await run((tx) =>
      adjustStock(tx, { address: address(), qty: '10', reason: '실사' }),
    )
    // 할당은 출고 작업(나중)에서 바꾼다. 여기서는 규칙 확인용으로 직접 넣는다
    await withStockWrite(() =>
      prisma.stock.update({ where: { id: stockId }, data: { allocatedQty: '7' } }),
    )
    await expect(
      run((tx) => adjustStock(tx, { address: address(), qty: '-4', reason: '파손' })),
    ).rejects.toThrow('뺄 수 있는 수량 3')
    expect(
      (await run((tx) => adjustStock(tx, { address: address(), qty: '-3', reason: '파손' })))
        .qtyAfter,
    ).toBe('7')
  })
})

describe('사용 중지·센터 (늘리기만 막는다, 사용자 결정)', () => {
  it('사용 중지된 로케이션: 넣기·이동해 들어오기는 거부, 빼기·이동해 나가기는 된다', async () => {
    const at = { locationId: ids.a01, itemId: ids.water }
    await run((tx) => adjustStock(tx, { address: at, qty: '10', reason: '실사' }))
    await prisma.location.update({ where: { id: ids.a01 }, data: { status: 'INACTIVE' } })

    await expect(
      run((tx) => adjustStock(tx, { address: at, qty: '1', reason: '실사' })),
    ).rejects.toThrow('사용 중지된 로케이션')
    await run((tx) => adjustStock(tx, { address: at, qty: '-1', reason: '파손' }))
    await run((tx) => moveStock(tx, { from: at, toLocationId: ids.a02, qty: '4' }))
    await expect(
      run((tx) =>
        moveStock(tx, { from: { ...at, locationId: ids.a02 }, toLocationId: ids.a01, qty: '1' }),
      ),
    ).rejects.toThrow('사용 중지된 로케이션')
    expect(await qtyAt(ids.a01, ids.water)).toEqual(['5'])
  })

  it('사용 중지된 품목: 늘리기는 거부, 줄이기는 된다', async () => {
    const at = { locationId: ids.a01, itemId: ids.water }
    await run((tx) => adjustStock(tx, { address: at, qty: '10', reason: '실사' }))
    await prisma.item.update({ where: { id: ids.water }, data: { status: 'INACTIVE' } })
    await expect(run((tx) => receiveStock(tx, { address: at, qty: '1' }))).rejects.toThrow(
      '사용 중지된 품목',
    )
    expect(
      (await run((tx) => adjustStock(tx, { address: at, qty: '-10', reason: '폐기' }))).qtyAfter,
    ).toBe('0')
  })

  it('화주사가 이용하지 않는 센터에는 넣을 수 없다', async () => {
    await expect(
      run((tx) =>
        receiveStock(tx, { address: { locationId: ids.gmhStaging, itemId: ids.water }, qty: '1' }),
      ),
    ).rejects.toThrow('센터를 이용하지 않습니다')
  })
})

describe('안전장치', () => {
  it('수량과 이력은 함께 저장되거나 함께 취소된다 (같은 트랜잭션의 뒤 작업이 실패하면 둘 다 없음)', async () => {
    await expect(
      run(async (tx) => {
        await receiveStock(tx, {
          address: { locationId: ids.staging, itemId: ids.water },
          qty: '9',
        })
        throw new Error('뒤 작업 실패')
      }),
    ).rejects.toThrow('뒤 작업 실패')
    expect(await prisma.stock.count()).toBe(0)
    expect(await prisma.stockTxn.count()).toBe(0)
  })

  it('재고 줄마다 이력 변동 합계 = 지금 수량', async () => {
    const water = { locationId: ids.staging, itemId: ids.water }
    await run((tx) => receiveStock(tx, { address: water, qty: '100' }))
    await run((tx) => moveStock(tx, { from: water, toLocationId: ids.a01, qty: '30' }))
    await run((tx) =>
      moveStock(tx, { from: { ...water, locationId: ids.a01 }, toLocationId: ids.a02, qty: '10' }),
    )
    await run((tx) => adjustStock(tx, { address: water, qty: '-5', reason: '파손' }))
    const stocks = await prisma.stock.findMany()
    const sums = await prisma.stockTxn.groupBy({ by: ['stockId'], _sum: { qtyChange: true } })
    const sumOf = new Map(sums.map((s) => [s.stockId, s._sum.qtyChange?.toString()]))
    expect(stocks.map((s) => [s.qty.toString(), sumOf.get(s.id)])).toEqual(
      stocks.map((s) => [s.qty.toString(), s.qty.toString()]),
    )
    expect(stocks.map((s) => s.qty.toString()).sort()).toEqual(['10', '20', '65'])
  })

  it('운영사 출입증이 없거나 다른 운영사면 쓸 수 없다', async () => {
    const address = { locationId: ids.staging, itemId: ids.water }
    await expect(
      prisma.$transaction((tx) => receiveStock(tx, { address, qty: '1' })),
    ).rejects.toThrow('운영사 출입증')
    const other = await createTestOperator('다른 운영사', 'OTHR')
    await expect(
      run((tx) => receiveStock(tx, { address, qty: '1' }), other.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await prisma.stock.count()).toBe(0)
  })
})

describe('재고가 있는 로케이션·품목은 쓰인 것 (지울 수 없다)', () => {
  it('findUsedLocationIds · findUsedItemIds', async () => {
    await run((tx) =>
      receiveStock(tx, { address: { locationId: ids.staging, itemId: ids.water }, qty: '1' }),
    )
    // 수량이 0이 되어도 기록이 남았으므로 쓰인 것
    await run((tx) =>
      adjustStock(tx, {
        address: { locationId: ids.staging, itemId: ids.water },
        qty: '-1',
        reason: '폐기',
      }),
    )
    expect(await findUsedLocationIds([ids.staging, ids.a01])).toEqual([ids.staging])
    expect(await findUsedItemIds([ids.water, ids.milk])).toEqual([ids.water])
    expect(await findUsedItemIds([])).toEqual([])
  })
})
