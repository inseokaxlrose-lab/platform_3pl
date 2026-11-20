import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES } from '@/config/permissions'
import { DEFAULT_CARRIERS } from '@/config/defaults/carriers'
import type { CarrierCreateInput } from '@/lib/carriers/carrier-schema'
import { provisionOperator } from '@/lib/operator/provision'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestShipper, versionOf } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createCarrierAction,
  deleteCarriersAction,
  listCarriersAction,
  restoreCarriersAction,
  setCarriersActiveAction,
  updateCarrierAction,
} from './actions'

// 운송사 (docs/decisions/0094): 운영사마다 한 벌, 기본 7곳은 운영사를 만들 때 복사

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

function signIn(operatorId = TEST_OPERATOR_ID) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(ALL_PERMISSION_CODES))
  vi.mocked(getCurrentScope).mockResolvedValue({ kind: 'ALL', operatorId } satisfies DataScope)
}

const input = (overrides: Partial<CarrierCreateInput> = {}): CarrierCreateInput => ({
  code: 'KD',
  custCode: '',
  name: '경동택배',
  carrierType: 'PARCEL',
  invoiceDigits: '12',
  invoiceCheck: 'MOD7',
  trackingUrl: '',
  tel: '',
  status: 'ACTIVE',
  sortOrder: 100,
  remark: '',
  ...overrides,
})

async function create(overrides: Partial<CarrierCreateInput> = {}) {
  const result = await createCarrierAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const codes = async (filters: Record<string, string> = {}) => {
  const result = await listCarriersAction({ ...createDataGridState(), filters })
  return result.ok ? result.data.rows.map((r) => r.code) : result
}

beforeEach(async () => {
  await resetDatabase()
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('기본 운송사 복사', () => {
  it('운영사를 만들면 택배 5곳 + 자차·용차가 들어가고, 다시 불러도 늘지 않으며 지운 것은 되살리지 않는다', async () => {
    await provisionOperator(prisma, TEST_OPERATOR_ID)
    expect(await codes()).toEqual(DEFAULT_CARRIERS.map((c) => c.code))
    const cj = await prisma.carrier.findFirstOrThrow({ where: { code: 'CJ' } })
    expect(cj).toMatchObject({ invoiceDigits: 12, invoiceCheck: 'MOD7', carrierType: 'PARCEL' })

    expect(await deleteCarriersAction({ ids: [String(cj.id)] })).toMatchObject({ ok: true })
    await provisionOperator(prisma, TEST_OPERATOR_ID)
    expect(await codes()).not.toContain('CJ')
    expect(await prisma.carrier.count({ where: { delYn: { in: ['Y', 'N'] } } })).toBe(7)
  })
})

describe('운송사 등록·수정', () => {
  it('코드는 대문자로, 겹치면 거부. 사용자 정의 코드도 운영사 안에서 겹치면 거부', async () => {
    await create({ code: 'kd', custCode: 'K01' })
    expect(await codes()).toEqual(['KD'])
    expect(await createCarrierAction(input())).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await createCarrierAction(input({ code: 'KD2', custCode: 'K01' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('KD') },
    })
  })

  it('다른 운영사는 같은 코드를 쓸 수 있고, 서로 보이지 않는다', async () => {
    await create()
    const other = await createTestOperator('다른운영사')
    signIn(other.id)
    await create({ name: '다른 경동' })
    expect(await codes()).toEqual(['KD'])
    expect(await prisma.carrier.count()).toBe(2)
  })

  it('체크디지트를 쓰면 자릿수 필수, 조회 주소는 {invoiceNo} 자리가 있어야 한다', async () => {
    expect(await createCarrierAction(input({ invoiceDigits: '' }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { invoiceDigits: [expect.any(String)] } },
    })
    expect(
      await createCarrierAction(input({ trackingUrl: 'https://track.example/no=' })),
    ).toMatchObject({ ok: false, error: { fieldErrors: { trackingUrl: [expect.any(String)] } } })
  })

  it('수정: 코드는 그대로, 다른 사람이 먼저 고쳤으면 거부', async () => {
    const { id } = await create()
    const rowVersion = await versionOf('carrier', id)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { code, ...rest } = input({ name: '경동택배(주)' })
    expect(await updateCarrierAction({ ...rest, id, rowVersion })).toMatchObject({ ok: true })
    expect(await updateCarrierAction({ ...rest, id, rowVersion })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await prisma.carrier.findUniqueOrThrow({ where: { id: BigInt(id) } })).toMatchObject({
      code: 'KD',
      name: '경동택배(주)',
    })
  })
})

describe('사용 중지·삭제·되살리기', () => {
  it('운송 계약·화주 기본 택배사에 쓰였으면 삭제 거부 (사용 중지는 된다)', async () => {
    const { id } = await create()
    const center = await createTestCenter('ICN')
    await prisma.carrierContract.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        carrierId: BigInt(id),
        centerId: center.id,
        custNo: 'C1',
      },
    })
    expect(await deleteCarriersAction({ ids: [id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('KD') },
    })
    expect(await setCarriersActiveAction({ ids: [id], isActive: false })).toMatchObject({
      ok: true,
    })

    const second = await create({ code: 'DS', name: '대신택배' })
    const shipper = await createTestShipper('GANA')
    await prisma.shipper.update({
      where: { id: shipper.id },
      data: { defaultCarrierId: BigInt(second.id) },
    })
    expect(await deleteCarriersAction({ ids: [second.id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('지운 운송사는 "삭제됨"에서 보이고, 같은 코드가 다시 생겼으면 되살릴 수 없다', async () => {
    const { id } = await create()
    expect(await deleteCarriersAction({ ids: [id] })).toMatchObject({ ok: true })
    expect(await codes()).toEqual([])
    expect(await codes({ status: 'DELETED' })).toEqual(['KD'])
    await create()
    expect(await restoreCarriersAction({ ids: [id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })
})
