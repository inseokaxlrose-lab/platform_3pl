import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { runInContext } from '@/lib/actor'
import { countCodeUsage } from '@/lib/common-code/code-usage'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import type { ShipperInput } from '@/lib/shippers/shipper-schema'
import { createTestCenter, createTestCodeGroup, versionOf } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createShipperAction,
  listShippersAction,
  setShippersActiveAction,
  updateShipperAction,
} from './actions'
import { getShipperForEdit } from './queries'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const CODES: PermissionCode[] = [
  'master.shippers.read',
  'master.shippers.create',
  'master.shippers.update',
]

function signIn(scope: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }, codes = CODES) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let icnId = 0n
let gmhId = 0n

const input = (overrides: Partial<ShipperInput> = {}): ShipperInput => ({
  code: '',
  name: '가나식품',
  businessNumber: '123-45-67891',
  ceoName: '',
  businessType: '',
  businessItem: '',
  phone: '02-123-4567',
  fax: '',
  email: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  centerIds: [String(icnId)],
  useLot: true,
  useExpiry: true,
  labelUnit: 'PLT',
  contacts: [
    { duty: 'INBOUND', name: '김입고', phone: '010-1111-2222', email: '', isPrimary: true },
  ],
  ...overrides,
})

async function create(overrides: Partial<ShipperInput> = {}) {
  const result = await createShipperAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await resetDatabase()
  icnId = (await createTestCenter('ICN')).id
  gmhId = (await createTestCenter('GMH')).id
  await createTestCodeGroup('CONTACT_ROLE', [{ code: 'INBOUND' }, { code: 'SETTLEMENT' }])
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('화주사 등록·수정', () => {
  it('시스템 코드 자동, 번호는 숫자만, 이용 센터·담당자·외부 코드 함께 저장', async () => {
    const shipper = await create()
    expect(shipper.systemCode).toMatch(/^SH\d{6}$/)
    expect(shipper.code).toBe(shipper.systemCode)
    const saved = await prisma.shipper.findUniqueOrThrow({
      where: { id: BigInt(shipper.id) },
      include: { centers: true, contacts: true },
    })
    expect(saved).toMatchObject({ businessNumber: '1234567891', phone: '021234567', useLot: 'Y' })
    expect(saved.centers.map((c) => c.centerId)).toEqual([icnId])
    expect(saved.contacts).toEqual([
      expect.objectContaining({ duty: 'INBOUND', phone: '01011112222', isPrimary: 'Y' }),
    ])
    // 담당 업무 코드가 쓰이고 있으면 공통코드에서 지울 수 없다
    // (사용 수는 운영사마다 센다 → 테스트 운영사 출입증 안에서)
    const usage = await runInContext({ actor: 'system', operatorId: TEST_OPERATOR_ID }, () =>
      countCodeUsage(prisma, 'CONTACT_ROLE', 'INBOUND'),
    )
    expect(usage).toBe(1)
  })

  it('입력 규칙: 이용 센터 1곳 이상, 사업자번호는 비우거나 검증번호까지, 담당자 규칙', async () => {
    expect(
      await createShipperAction(
        input({ centerIds: [], businessNumber: '1234567890', contacts: [] }),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        fieldErrors: {
          centerIds: [expect.stringContaining('1곳 이상')],
          businessNumber: [expect.any(String)],
        },
      },
    })
    expect(await createShipperAction(input({ businessNumber: '' }))).toMatchObject({ ok: true })
    expect(
      await createShipperAction(
        input({
          code: 'X2',
          contacts: [{ duty: 'NOPE', name: '김', phone: '', email: 'a@b.co', isPrimary: true }],
        }),
      ),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('NOPE') } })
  })

  it('코드 중복·시스템 코드 모양 거부, 일시중지·폐쇄 센터는 새로 붙일 수 없다', async () => {
    await create({ code: 'GANA' })
    expect(await createShipperAction(input({ code: 'gana' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await createShipperAction(input({ code: 'SH000999' }))).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('시스템 코드 모양') },
    })
    await prisma.center.update({
      where: { id: gmhId },
      data: { status: 'SUSPENDED', statusReason: '점검' },
    })
    expect(
      await createShipperAction(input({ code: 'NEW', centerIds: [String(gmhId)] })),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('수정: 이용 센터·담당자를 통째로 바꾼다 (이미 연결된 일시중지 센터는 그대로 둘 수 있다)', async () => {
    const shipper = await create({ code: 'GANA', centerIds: [String(icnId), String(gmhId)] })
    await prisma.center.update({
      where: { id: gmhId },
      data: { status: 'SUSPENDED', statusReason: '점검' },
    })
    const result = await updateShipperAction({
      id: shipper.id,
      rowVersion: await versionOf('shipper', shipper.id),
      ...input({
        code: 'GANA',
        name: '가나푸드',
        centerIds: [String(gmhId)],
        contacts: [],
        useLot: false,
      }),
    })
    expect(result).toMatchObject({ ok: true })
    const saved = await prisma.shipper.findUniqueOrThrow({
      where: { id: BigInt(shipper.id) },
      include: { centers: true, contacts: true },
    })
    expect(saved).toMatchObject({ name: '가나푸드', useLot: 'N' })
    expect(saved.centers.map((c) => c.centerId)).toEqual([gmhId])
    expect(saved.contacts).toEqual([])
  })
})

describe('목록 · 데이터 범위', () => {
  it('이용 센터·상태·로트·유통기한·라벨 단위로 거른다', async () => {
    await create({ code: 'GANA' })
    await create({
      code: 'DARA',
      name: '다라전자',
      centerIds: [String(icnId), String(gmhId)],
      useLot: false,
      useExpiry: false,
      labelUnit: 'BOX',
    })
    const codes = async (filters: Record<string, string>) => {
      const r = await listShippersAction({ ...createDataGridState(), filters })
      return r.ok ? r.data.rows.map((s) => s.code).sort() : r.error
    }
    expect(await codes({ center: String(gmhId) })).toEqual(['DARA'])
    expect(await codes({ lot: 'Y' })).toEqual(['GANA'])
    expect(await codes({ expiry: 'N' })).toEqual(['DARA'])
    expect(await codes({ labelUnit: 'BOX' })).toEqual(['DARA'])
    const all = await listShippersAction(createDataGridState())
    expect(all.ok && all.data.rows.find((s) => s.code === 'DARA')?.centers).toBe(
      'ICN 센터, GMH 센터',
    )
  })

  it('센터 직원: 자기 센터를 이용하는 화주사만 보고, 등록·수정·사용 중지는 못 한다', async () => {
    const gana = await create({ code: 'GANA', centerIds: [String(icnId)] })
    const dara = await create({ code: 'DARA', centerIds: [String(gmhId)] })
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [gmhId] })

    const list = await listShippersAction(createDataGridState())
    expect(list.ok && list.data.rows.map((s) => s.code)).toEqual(['DARA'])
    expect(
      await getShipperForEdit(BigInt(gana.id), {
        kind: 'CENTERS',
        operatorId: TEST_OPERATOR_ID,
        centerIds: [gmhId],
      }),
    ).toBeNull()
    expect(
      await getShipperForEdit(BigInt(dara.id), {
        kind: 'CENTERS',
        operatorId: TEST_OPERATOR_ID,
        centerIds: [gmhId],
      }),
    ).not.toBeNull()

    expect(await createShipperAction(input({ code: 'NEW' }))).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(await setShippersActiveAction({ ids: [dara.id], isActive: false })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })

  it('일괄 사용 중지, 엑셀 전체는 엑셀 권한 필요', async () => {
    const gana = await create({ code: 'GANA' })
    expect(await setShippersActiveAction({ ids: [gana.id], isActive: false })).toEqual({
      ok: true,
      data: { count: 1 },
    })
    expect(await listShippersAction({ ...createDataGridState(), exportAll: true })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
