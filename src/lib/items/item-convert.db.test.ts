import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_PERMISSION_CODES } from '@/config/permissions'
import { createItemAction } from '@/app/admin/master/items/actions'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestShipper, systemUnit } from '@/test/factories'
import { itemInput, unitRow } from '@/test/item-input'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  calcItemVolume,
  convertItemQty,
  loadItemUoms,
  splitByUom,
  toItemBaseQty,
} from './item-convert'

// 품목 단위 환산 — DB에서 단위 표를 읽는 쪽 (계산 자체는 item-uom.test.ts)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

let ea = 0n
let box = 0n
let plt = 0n
let shipperId = 0n
const inContext = <T>(fn: () => Promise<T>) =>
  runInContext({ actor: 'test', operatorId: TEST_OPERATOR_ID }, fn)

async function createItem(code: string, overrides: Parameters<typeof itemInput>[1] = {}) {
  const result = await createItemAction({
    shipperId: String(shipperId),
    code,
    ...itemInput(ea, overrides),
  })
  if (!result.ok) throw new Error(result.error.message)
  return BigInt(result.data.id)
}

beforeEach(async () => {
  await resetDatabase()
  ea = (await systemUnit('EA')).id
  box = (await systemUnit('BOX')).id
  plt = (await systemUnit('PLT')).id
  shipperId = (await createTestShipper('GANA')).id
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(ALL_PERMISSION_CODES))
  vi.mocked(getCurrentScope).mockResolvedValue({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('item-convert (DB의 품목 단위 표로 환산)', () => {
  it('팔레트로 계산한 PLT까지 읽어 환산·분해·체적을 계산한다', async () => {
    // BOX 24 (30×20×25cm, 12kg), T11 · 8 × 5 = 40 BOX → PLT 960
    const id = await createItem('WATER', {
      units: [
        unitRow('BASE', ea, '1'),
        unitRow('BOX', box, '24', {
          widthCm: '30',
          depthCm: '20',
          heightCm: '25',
          grossWeightKg: '12',
        }),
      ],
      palletTypeCode: 'T11',
      palletTi: 8,
      palletHi: 5,
    })
    await inContext(async () => {
      expect(await toItemBaseQty(prisma, id, '2', 'PLT')).toBe('1920')
      expect(await convertItemQty(prisma, id, '100', 'EA', 'BOX', { remainder: true })).toEqual({
        qty: '4',
        remainder: '4',
      })
      expect(await splitByUom(prisma, id, '1000')).toEqual([
        { unit: 'PLT', qty: '1' },
        { unit: 'BOX', qty: '1' },
        { unit: 'EA', qty: '16' },
      ])
      expect(await calcItemVolume(prisma, id, '48')).toMatchObject({
        status: 'OK',
        cbm: '0.03',
        grossWeightKg: '24',
      })
    })
  })

  it('기본 입고·주문단위: 비우면 입고 = BOX(없으면 기본단위)·주문 = 기본단위, 정하면 그 단위', async () => {
    const auto = await createItem('AUTO', {
      units: [unitRow('BASE', ea, '1'), unitRow('BOX', box, '24')],
    })
    const single = await createItem('SINGLE')
    const fixed = await createItem('FIXED', {
      units: [unitRow('BASE', ea, '1'), unitRow('BOX', box, '24'), unitRow('PLT', plt, '960')],
      defaultInboundUnitId: String(plt),
      defaultOrderUnitId: String(box),
    })
    await inContext(async () => {
      expect(await loadItemUoms(prisma, auto)).toMatchObject({
        defaultInboundUnit: 'BOX',
        defaultOrderUnit: 'EA',
      })
      expect(await loadItemUoms(prisma, single)).toMatchObject({
        defaultInboundUnit: 'EA',
        defaultOrderUnit: 'EA',
      })
      expect(await loadItemUoms(prisma, fixed)).toMatchObject({
        defaultInboundUnit: 'PLT',
        defaultOrderUnit: 'BOX',
      })
      // BOX 규격이 없으면 체적 미등록
      expect(await calcItemVolume(prisma, auto, '24')).toMatchObject({ status: 'VOLUME_MISSING' })
    })
  })
})
