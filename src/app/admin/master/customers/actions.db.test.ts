import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { getCustomerForEdit } from '@/lib/customers/customer-queries'
import type { CustomerCreateInput } from '@/lib/customers/customer-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import {
  createTestCenter,
  createTestCodeGroup,
  createTestShipper,
  versionOf,
} from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createCustomerAction,
  deleteCustomersAction,
  listCustomersAction,
  restoreCustomersAction,
  updateCustomerAction,
} from './actions'

// 거래처 (docs/decisions/0043)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }

function signIn(scope: DataScope = ALL, codes: PermissionCode[] = [...ALL_PERMISSION_CODES]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let icn = 0n
let gmh = 0n
let gana = 0n // 이천센터 이용
let dara = 0n // 이천·김해센터 이용

// 성남시 분당구 백현동 법정동코드 (경기 41, 성남 분당 41135)
const BUNDANG = '4113510900'

const input = (overrides: Partial<CustomerCreateInput> = {}): CustomerCreateInput => ({
  shipperId: String(gana),
  code: '',
  name: '한빛마트 분당점',
  businessNumber: '',
  ceoName: '',
  phone: '031-123-4567',
  email: '',
  zipCode: '13529',
  address: '경기 성남시 분당구 판교역로 166',
  addressDetail: '1층',
  regionCode: BUNDANG,
  receiverName: '김수령',
  receiverPhone: '010-1111-2222',
  deliveryMemo: '',
  remark: '',
  contacts: [],
  externalCodes: { SAP: '', ERP: '' },
  ...overrides,
})

async function create(overrides: Partial<CustomerCreateInput> = {}) {
  const result = await createCustomerAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

// 센터의 배송권역 + 담당 지역
async function createZone(centerId: bigint, name: string, regionCodes: string[]) {
  const zone = await prisma.deliveryZone.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      centerId,
      systemCode: `DZ-T-${name}`,
      code: name,
      name,
      regions: { create: regionCodes.map((regionCode) => ({ regionCode })) },
    },
  })
  return zone.id
}

beforeEach(async () => {
  await resetDatabase()
  icn = (await createTestCenter('ICN', { name: '이천센터' })).id
  gmh = (await createTestCenter('GMH', { name: '김해센터' })).id
  gana = (await createTestShipper('GANA')).id
  dara = (await createTestShipper('DARA')).id
  await prisma.shipper.update({
    where: { id: gana },
    data: { centers: { create: [{ centerId: icn }] } },
  })
  await prisma.shipper.update({
    where: { id: dara },
    data: { centers: { create: [{ centerId: icn }, { centerId: gmh }] } },
  })
  await createTestCodeGroup('CONTACT_ROLE', [{ code: 'INBOUND' }, { code: 'OUTBOUND' }])
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('거래처 등록 · 수정', () => {
  it('시스템 코드 자동, 번호는 숫자만, 법정동코드·담당자·외부 코드 함께, 운영사 자동', async () => {
    const created = await create({
      contacts: [{ duty: 'OUTBOUND', name: '박담당', phone: '', email: 'a@b.co', isPrimary: true }],
      externalCodes: { SAP: 'C-100', ERP: '' },
    })
    const saved = await prisma.customer.findUniqueOrThrow({
      where: { id: BigInt(created.id) },
      include: { contacts: true },
    })
    expect(saved.systemCode).toMatch(/^CU\d{8}$/)
    expect(saved).toMatchObject({
      code: saved.systemCode,
      operatorId: TEST_OPERATOR_ID,
      shipperId: gana,
      phone: '0311234567',
      receiverPhone: '01011112222',
      regionCode: BUNDANG,
      createdBy: 'boss',
    })
    expect(saved.contacts.map((c) => [c.duty, c.name, c.isPrimary])).toEqual([
      ['OUTBOUND', '박담당', 'Y'],
    ])
    expect(await getExternalCodes('CUSTOMER', BigInt(created.id))).toEqual({
      SAP: 'C-100',
      ERP: '',
    })
  })

  it('거래처코드는 같은 화주사 안에서만 겹칠 수 없다, 없는 담당 업무 코드는 거부', async () => {
    await create({ code: 'hanbit' })
    expect(await createCustomerAction(input({ code: 'HANBIT' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('거래처코드') },
    })
    expect(
      (await createCustomerAction(input({ shipperId: String(dara), code: 'HANBIT' }))).ok,
    ).toBe(true)
    expect(
      await createCustomerAction(
        input({
          contacts: [{ duty: 'NOPE', name: '김', phone: '', email: 'a@b.co', isPrimary: true }],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('NOPE') },
    })
  })

  it('수정: 화주사는 그대로, 버전이 다르면 충돌, 법정동코드를 비우면 null', async () => {
    const created = await create({ code: 'C1' })
    const { shipperId, ...rest } = input({ code: 'C1', name: '한빛마트 본점', regionCode: '' })
    void shipperId
    expect(
      await updateCustomerAction({
        ...rest,
        id: created.id,
        rowVersion: await versionOf('customer', created.id),
      }),
    ).toMatchObject({ ok: true })
    expect(await getCustomerForEdit(BigInt(created.id), ALL)).toMatchObject({
      shipperId: String(gana),
      input: { name: '한빛마트 본점', regionCode: '' },
    })
    expect(await updateCustomerAction({ ...rest, id: created.id, rowVersion: 1 })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })
})

describe('목록 · 배송권역 맞추기', () => {
  it('배송지가 드는 배송권역을 화주사가 이용하는 센터별로 보여 준다 (시·도 2자리, 시·군·구 5자리)', async () => {
    await createZone(icn, '분당권', ['41135']) // 이천센터: 성남 분당구
    await createZone(gmh, '경기권', ['41']) // 김해센터: 경기도 전체
    await createZone(icn, '서울권', ['11']) // 맞지 않음
    await create({ code: 'GANA-C' }) // 가나: 이천센터만 이용
    await create({ shipperId: String(dara), code: 'DARA-C' }) // 다라: 이천·김해 이용
    await create({ code: 'NOREGION', regionCode: '' })

    const result = await listCustomersAction(createDataGridState())
    const zones = Object.fromEntries(
      (result.ok ? result.data.rows : []).map((r) => [r.code, r.zones]),
    )
    expect(zones).toEqual({
      'GANA-C': '이천센터: 분당권',
      'DARA-C': expect.stringMatching(
        /이천센터: 분당권.*김해센터: 경기권|김해센터: 경기권.*이천센터: 분당권/,
      ),
      NOREGION: null,
    })
  })

  it('사용 중지·지운 권역은 맞추지 않는다', async () => {
    const zoneId = await createZone(icn, '분당권', ['41135'])
    await create({ code: 'C1' })
    await prisma.deliveryZone.update({ where: { id: zoneId }, data: { status: 'INACTIVE' } })
    const result = await listCustomersAction(createDataGridState())
    expect(result.ok && result.data.rows[0].zones).toBeNull()
  })
})

describe('데이터 범위 · 삭제', () => {
  it('센터 직원: 소속 센터를 이용하는 화주사의 거래처만', async () => {
    await create({ code: 'GANA-C' })
    const dara1 = await create({ shipperId: String(dara), code: 'DARA-C' })
    // 김해센터 직원: 다라만 김해를 이용한다
    const gmhScope: DataScope = { kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [gmh] }
    signIn(gmhScope)
    const result = await listCustomersAction(createDataGridState())
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual(['DARA-C'])
    expect(await createCustomerAction(input())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await getCustomerForEdit(BigInt(dara1.id), gmhScope)).not.toBeNull()
  })

  it('지우면 목록에서 빠지고 "삭제됨"에서 되살린다 (같은 코드가 다시 생겼으면 거부)', async () => {
    const a = await create({ code: 'C1' })
    expect(await deleteCustomersAction({ ids: [a.id] })).toEqual({ ok: true, data: { count: 1 } })
    const b = await create({ code: 'C1' })
    expect(await restoreCustomersAction({ ids: [a.id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    await deleteCustomersAction({ ids: [b.id] })
    expect(await restoreCustomersAction({ ids: [a.id] })).toEqual({ ok: true, data: { count: 1 } })
  })

  it('엑셀 전체 읽기는 엑셀 권한이 필요하다', async () => {
    signIn(ALL, ['master.customers.read'])
    expect(await listCustomersAction({ ...createDataGridState(), exportAll: true })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
