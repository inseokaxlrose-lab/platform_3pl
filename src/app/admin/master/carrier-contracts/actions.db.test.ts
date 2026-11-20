import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES } from '@/config/permissions'
import type { ContractInput } from '@/lib/carriers/contract-schema'
import { findContractFor } from '@/lib/carriers/contracts'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestShipper, versionOf } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createContractAction,
  deleteContractsAction,
  listContractsAction,
  restoreContractsAction,
  updateContractAction,
} from './actions'

// 운송 계약 (docs/decisions/0094): 센터(·화주)별 택배사 계약, 송장 대역, 기본 계약, 출고 때 찾는 순서

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

function signIn(scope: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(ALL_PERMISSION_CODES))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let icn = 0n
let gmh = 0n
let gana = 0n
let cj = 0n
let own = 0n

const input = (overrides: Partial<ContractInput> = {}): ContractInput => ({
  carrierId: String(cj),
  centerId: String(icn),
  shipperId: '',
  custNo: 'C-1001',
  pickupBranch: '인천 집하',
  invoiceStart: '',
  invoiceEnd: '',
  invoiceNext: '',
  isDefault: false,
  validFrom: '',
  validTo: '',
  status: 'ACTIVE',
  remark: '',
  ...overrides,
})

async function create(overrides: Partial<ContractInput> = {}) {
  const result = await createContractAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await resetDatabase()
  signIn()
  icn = (await createTestCenter('ICN')).id
  gmh = (await createTestCenter('GMH')).id
  gana = (await createTestShipper('GANA')).id
  await prisma.shipperCenter.create({ data: { shipperId: gana, centerId: icn } })
  const carrier = (code: string, data: object) =>
    prisma.carrier.create({ data: { operatorId: TEST_OPERATOR_ID, code, name: code, ...data } })
  cj = (await carrier('CJ', { invoiceDigits: 12, invoiceCheck: 'MOD7' })).id
  own = (await carrier('OWN', { carrierType: 'OWN' })).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('운송 계약 등록', () => {
  it('센터 공용 계약: 다음 번호를 비우면 시작 번호부터', async () => {
    const { id } = await create({ invoiceStart: '60000000000', invoiceEnd: '60000009999' })
    expect(
      await prisma.carrierContract.findUniqueOrThrow({ where: { id: BigInt(id) } }),
    ).toMatchObject({ shipperId: null, invoiceNext: '60000000000', defaultYn: 'N' })
  })

  it('화주는 그 센터를 이용하는 화주사만', async () => {
    expect((await createContractAction(input({ shipperId: String(gana) }))).ok).toBe(true)
    expect(
      await createContractAction(input({ centerId: String(gmh), shipperId: String(gana) })),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('송장 대역: 본번호 자릿수(12자리 - 체크디지트 = 11), 택배만, 같은 택배사의 다른 계약과 겹치면 거부', async () => {
    expect(
      await createContractAction(input({ invoiceStart: '6000000000', invoiceEnd: '6000009999' })),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('11자리') } })
    expect(
      await createContractAction(
        input({ carrierId: String(own), invoiceStart: '100', invoiceEnd: '199' }),
      ),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('택배') } })
    await create({ invoiceStart: '60000000000', invoiceEnd: '60000009999' })
    expect(
      await createContractAction(
        input({
          centerId: String(gmh),
          custNo: 'C-2001',
          invoiceStart: '60000005000',
          invoiceEnd: '60000019999',
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('겹칩니다') },
    })
  })

  it('같은 센터·화주·운송사에 같은 고객코드는 거부', async () => {
    await create()
    expect(await createContractAction(input())).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('기본 계약은 같은 센터·화주 범위에 하나: 새 기본이 생기면 앞의 기본이 풀린다', async () => {
    const first = await create({ isDefault: true })
    await create({ carrierId: String(own), custNo: 'OWN-1', isDefault: true })
    const firstRow = await prisma.carrierContract.findUniqueOrThrow({
      where: { id: BigInt(first.id) },
    })
    expect(firstRow.defaultYn).toBe('N')
    // 다른 범위(화주 계약)의 기본은 건드리지 않는다
    await create({ shipperId: String(gana), custNo: 'G-1', isDefault: true })
    expect(await prisma.carrierContract.count({ where: { defaultYn: 'Y' } })).toBe(2)
  })
})

describe('수정·데이터 범위', () => {
  it('다른 사람이 먼저 고쳤으면 거부', async () => {
    const { id } = await create()
    const rowVersion = await versionOf('carrierContract', id)
    expect(
      await updateContractAction({ ...input({ custNo: 'C-9' }), id, rowVersion }),
    ).toMatchObject({ ok: true })
    expect(await updateContractAction({ ...input(), id, rowVersion })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('센터 직원: 소속 센터 계약만 보이고, 다른 센터 계약은 고치거나 만들 수 없다', async () => {
    const atGmh = await create({ centerId: String(gmh) })
    await create()
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [icn] })
    const list = await listContractsAction(createDataGridState())
    expect(list.ok && list.data.rows.map((r) => r.centerName)).toEqual(['ICN 센터'])
    expect(
      await updateContractAction({
        ...input({ centerId: String(gmh) }),
        id: atGmh.id,
        rowVersion: await versionOf('carrierContract', atGmh.id),
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await createContractAction(input({ centerId: String(gmh), custNo: 'X' }))).toMatchObject(
      { ok: false, error: { code: 'NOT_FOUND' } },
    )
  })
})

describe('삭제·되살리기', () => {
  it('지우면 기본 표시가 풀리고, 같은 고객코드가 다시 생겼으면 되살릴 수 없다', async () => {
    const { id } = await create({ isDefault: true })
    expect(await deleteContractsAction({ ids: [id] })).toMatchObject({ ok: true })
    await create()
    expect(await restoreContractsAction({ ids: [id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })
})

describe('출고 때 계약 찾기 (화주×센터 → 센터 공용, 기본 먼저)', () => {
  it('화주 계약이 있으면 그것, 없으면 센터 공용. 유효기간·사용 중지는 뺀다', async () => {
    const today = '2026-11-20'
    const common = await create({ custNo: 'COMMON' })
    expect((await findContractFor(prisma, { centerId: icn, shipperId: gana, today }))?.custNo).toBe(
      'COMMON',
    )
    await create({ shipperId: String(gana), custNo: 'OLD', validTo: '2026-11-19' })
    await create({ shipperId: String(gana), custNo: 'G-1' })
    await create({ shipperId: String(gana), custNo: 'G-DEFAULT', isDefault: true })
    expect((await findContractFor(prisma, { centerId: icn, shipperId: gana, today }))?.custNo).toBe(
      'G-DEFAULT',
    )
    void common
  })
})
