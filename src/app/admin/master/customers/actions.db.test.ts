import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { getCustomerForEdit } from '@/lib/customers/customer-queries'
import type { CustomerCreateInput } from '@/lib/customers/customer-schema'
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
  ...overrides,
})

async function create(overrides: Partial<CustomerCreateInput> = {}) {
  const result = await createCustomerAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

// 권역설정 배정 (0076): 우편번호(지역 마스터) + 배정표. bjdCode를 주면 우편번호↔법정동도
async function assignZip(zipCode: string, centerId: bigint | null, bjdCode?: string) {
  await prisma.regionZip.upsert({
    where: { code: zipCode },
    create: {
      code: zipCode,
      sidoCode: zipCode.slice(0, 2),
      sigunguCode: '00000',
      firstLoadVer: 'T',
      lastLoadVer: 'T',
    },
    update: {},
  })
  if (bjdCode) {
    await prisma.regionBjd.upsert({
      where: { code: bjdCode },
      create: {
        code: bjdCode,
        sidoCode: bjdCode.slice(0, 2),
        sidoName: '시도',
        sigunguCode: bjdCode.slice(0, 5),
        level: 3,
        loadVer: 'T',
      },
      update: {},
    })
    await prisma.regionZipBjd.upsert({
      where: { zipCode_bjdCode: { zipCode, bjdCode } },
      create: { zipCode, bjdCode, addressCount: 1 },
      update: {},
    })
  }
  if (!centerId) return
  const batch = await prisma.regionChangeBatch.create({
    data: { operatorId: TEST_OPERATOR_ID, changeType: 'GRID_ASSIGN', scopeDesc: '테스트' },
  })
  await prisma.regionCenterMap.upsert({
    where: {
      operatorId_zipCode_tempZone: { operatorId: TEST_OPERATOR_ID, zipCode, tempZone: 'ALL' },
    },
    create: { operatorId: TEST_OPERATOR_ID, zipCode, centerId, lastBatchId: batch.id },
    update: { centerId, lastBatchId: batch.id },
  })
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

describe('배송 센터 (0072)', () => {
  const GANGNAM = '1168010100' // 서울 강남구

  it('배송 센터는 그 화주사의 이용 센터만 저장되고, 비우면 null', async () => {
    // 가나식품은 이천센터만 이용
    expect(await createCustomerAction(input({ deliveryCenterId: String(gmh) }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('이용하는 센터') },
    })
    const fixed = await create({ code: 'C1', deliveryCenterId: String(icn) })
    const free = await create({ code: 'C2', deliveryCenterId: '' })
    const centerOf = async (id: string) =>
      (await prisma.customer.findUniqueOrThrow({ where: { id: BigInt(id) } })).deliveryCenterId
    expect(await centerOf(fixed.id)).toBe(icn)
    expect(await centerOf(free.id)).toBeNull()
  })

  it('목록의 배송 센터: 지정 → 권역설정(배송지 우편번호, 없으면 법정동) → 미배정', async () => {
    // 다라상사는 이천·김해 이용
    await assignZip('13529', icn)
    await assignZip('06236', null, GANGNAM)
    await create({ code: 'ZIP', shipperId: String(dara) }) // 13529
    await create({ code: 'NOMAP', shipperId: String(dara), zipCode: '06236', regionCode: GANGNAM })
    await create({
      code: 'FIX',
      shipperId: String(dara),
      zipCode: '06236',
      regionCode: GANGNAM,
      deliveryCenterId: String(gmh),
    })
    await create({ code: 'BJD', shipperId: String(dara), zipCode: '', regionCode: GANGNAM })
    await create({ code: 'NONE', shipperId: String(dara), zipCode: '', regionCode: '' })

    const centers = async () => {
      const result = await listCustomersAction(createDataGridState())
      return Object.fromEntries(
        (result.ok ? result.data.rows : []).map((r) => [r.code, r.deliveryCenter]),
      )
    }
    expect(await centers()).toEqual({
      ZIP: '이천센터 (권역)',
      NOMAP: '미배정',
      FIX: '김해센터 (지정)',
      BJD: '미배정',
      NONE: null,
    })
    // 06236을 김해로 배정하면 우편번호·법정동 모두 김해
    await assignZip('06236', gmh)
    expect(await centers()).toMatchObject({ NOMAP: '김해센터 (권역)', BJD: '김해센터 (권역)' })
  })
})
