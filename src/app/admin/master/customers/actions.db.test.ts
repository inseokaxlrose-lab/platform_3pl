import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { getCustomerForEdit } from '@/lib/customers/customer-queries'
import {
  EMPTY_SHIP_TO,
  type CustomerCreateInput,
  type ShipToInput,
} from '@/lib/customers/customer-schema'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestCodeGroup, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createCustomerAction,
  deleteCustomersAction,
  listCustomersAction,
  restoreCustomersAction,
  setCustomersStatusAction,
  updateCustomerAction,
} from './actions'

// 거래처·납품처 (docs/decisions/0043, 0082)

// 주소 검색 API 대신 가짜 검색기: 아는 주소 두 곳만 1건으로 찾고, 나머지는 0건
vi.mock('@/lib/regions/juso-client', () => {
  const KNOWN = [
    {
      key: '판교역로 166',
      hit: {
        roadAddress: '경기도 성남시 분당구 판교역로 166',
        jibunAddress: '경기도 성남시 분당구 백현동 532',
        zipCode: '13529',
        bjdCode: '4113510900',
        bdMgtSn: '4113510900105320000000001',
        buildingName: '',
      },
    },
    {
      key: '테헤란로 152',
      hit: {
        roadAddress: '서울특별시 강남구 테헤란로 152',
        jibunAddress: '서울특별시 강남구 역삼동 737',
        zipCode: '06236',
        bjdCode: '1168010100',
        bdMgtSn: '1168010100107370000000001',
        buildingName: '',
      },
    },
  ]
  return {
    jusoSearcher: () => async (keyword: string) => {
      const found = KNOWN.find((k) => keyword.includes(k.key))
      return found
        ? { status: 'OK', total: 1, hits: [found.hit] }
        : { status: 'OK', total: 0, hits: [] }
    },
  }
})

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
  code: 'C1',
  custCode: '',
  name: '한빛마트 분당점',
  shortName: '',
  customerType: '',
  customerGroup: '',
  businessNumber: '',
  ceoName: '',
  orderAddrMode: 'SHIP_TO',
  phone: '031-123-4567',
  fax: '',
  email: '',
  zipCode: '13529',
  address: '경기 성남시 분당구 판교역로 166',
  addressDetail: '1층',
  addressJibun: '',
  regionCode: BUNDANG,
  minShelfDays: null,
  minShelfRatio: '',
  remark: '',
  contacts: [],
  shipTos: [],
  ...overrides,
})

// 납품처 한 곳 (기본값: 강남 주소, 권역 자동)
const shipTo = (overrides: Partial<ShipToInput> = {}): ShipToInput => ({
  ...EMPTY_SHIP_TO,
  code: 'S1',
  name: '강남 매장',
  isDefault: true,
  zipCode: '06236',
  address: '서울 강남구 테헤란로 152',
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
  it('번호는 숫자만, 담당자 함께, 납품처가 없으면 거래처 주소로 기본 납품처', async () => {
    await assignZip('13529', icn)
    const created = await create({
      code: 'hanbit-1',
      contacts: [{ duty: 'OUTBOUND', name: '박담당', phone: '', email: 'a@b.co', isPrimary: true }],
    })
    const saved = await prisma.customer.findUniqueOrThrow({
      where: { id: BigInt(created.id) },
      include: { contacts: true, shipTos: true },
    })
    expect(saved).toMatchObject({
      code: 'HANBIT-1',
      operatorId: TEST_OPERATOR_ID,
      shipperId: gana,
      phone: '0311234567',
      status: 'ACTIVE',
      source: 'SCREEN',
      rawAddress: '경기 성남시 분당구 판교역로 166',
      addressGrade: 'A',
      createdBy: 'boss',
    })
    expect(saved.contacts.map((c) => [c.duty, c.name, c.isPrimary])).toEqual([
      ['OUTBOUND', '박담당', 'Y'],
    ])
    // 기본 납품처: 코드는 거래처코드-01 자동 체번(0084), 이름 그대로, 주소 동기화, 권역 자동으로 이천센터
    expect(saved.shipTos).toHaveLength(1)
    expect(saved.shipTos[0]).toMatchObject({
      code: 'HANBIT-1-01',
      name: '한빛마트 분당점',
      isDefault: 'Y',
      systemCreatedYn: 'Y',
      addrSyncYn: 'Y',
      zipCode: '13529',
      regionCode: BUNDANG,
      addressGrade: 'A',
      deliveryCenterId: icn,
      regionCenterId: icn,
      centerAssignType: 'AUTO',
      centerAssignStatus: 'ASSIGNED',
      regionMismatchYn: 'N',
      resolveLevel: 'ZIP',
    })
  })

  it('거래처코드는 비우면 자동 · 화주사 안에서 겹칠 수 없다, 납품처도 주소도 없으면 거부', async () => {
    // 비우면 화주 접두어 + C + 6자리 (0084), 자동 체번 모양은 직접 넣을 수 없다
    const auto = await createCustomerAction(input({ code: '' }))
    const prefix = (await prisma.shipper.findUniqueOrThrow({ where: { id: gana } })).codePrefix
    expect(auto.ok && auto.data.code).toBe(`${prefix}C000001`)
    expect(await createCustomerAction(input({ code: `${prefix}C000099` }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('자동 체번 모양') },
    })
    await create({ code: 'hanbit' })
    expect(await createCustomerAction(input({ code: 'HANBIT' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('거래처코드') },
    })
    expect(
      (await createCustomerAction(input({ shipperId: String(dara), code: 'HANBIT' }))).ok,
    ).toBe(true)
    expect(
      await createCustomerAction(input({ code: 'NOADDR', zipCode: '', address: '' })),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { address: [expect.stringContaining('납품처')] } },
    })
    expect(
      await createCustomerAction(
        input({
          code: 'C9',
          contacts: [{ duty: 'NOPE', name: '김', phone: '', email: 'a@b.co', isPrimary: true }],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('NOPE') },
    })
  })

  it('수정: 화주사·거래처코드는 그대로, 버전이 다르면 충돌', async () => {
    const created = await create({ code: 'C1' })
    const edit = await getCustomerForEdit(BigInt(created.id), ALL)
    expect(
      await updateCustomerAction({
        ...edit!.input,
        name: '한빛마트 본점',
        id: created.id,
        rowVersion: edit!.rowVersion,
      }),
    ).toMatchObject({ ok: true })
    expect(await getCustomerForEdit(BigInt(created.id), ALL)).toMatchObject({
      shipperId: String(gana),
      code: 'C1',
      input: { name: '한빛마트 본점' },
    })
    expect(
      await updateCustomerAction({ ...edit!.input, id: created.id, rowVersion: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('거래중지 · 거래재개', async () => {
    const created = await create()
    expect(
      await setCustomersStatusAction({ ids: [created.id], status: 'SUSPENDED' }),
    ).toMatchObject({ ok: true })
    const statusOf = async () =>
      (await prisma.customer.findUniqueOrThrow({ where: { id: BigInt(created.id) } })).status
    expect(await statusOf()).toBe('SUSPENDED')
    await setCustomersStatusAction({ ids: [created.id], status: 'ACTIVE' })
    expect(await statusOf()).toBe('ACTIVE')
  })
})

describe('납품처 · 배송센터 (0082)', () => {
  const shipTosOf = (customerId: string) =>
    prisma.shipTo.findMany({
      where: { customerId: BigInt(customerId), delYn: 'N' },
      orderBy: { sortOrder: 'asc' },
    })

  it('기본 납품처는 정확히 1곳, 코드는 겹칠 수 없다', async () => {
    expect(
      await createCustomerAction(input({ shipTos: [shipTo({ isDefault: false })] })),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(
      await createCustomerAction(input({ shipTos: [shipTo(), shipTo({ isDefault: false })] })),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('권역 자동: 배정된 지역이면 지정 완료, 배정 안 된 지역이면 확인 필요로 저장하고 알려 준다', async () => {
    await assignZip('06236', icn)
    const ok = await create({ code: 'A1', shipTos: [shipTo()] })
    expect((await shipTosOf(ok.id))[0]).toMatchObject({
      deliveryCenterId: icn,
      centerAssignType: 'AUTO',
      centerAssignStatus: 'ASSIGNED',
    })
    // 13529는 권역 배정이 없다
    const hold = await createCustomerAction(
      input({
        code: 'A2',
        shipTos: [
          shipTo({ code: 'BD', zipCode: '13529', address: '경기 성남시 분당구 판교역로 166' }),
        ],
      }),
    )
    expect(hold).toMatchObject({ ok: true, data: { notice: expect.stringContaining('BD') } })
    expect((await shipTosOf(hold.ok ? hold.data.id : ''))[0]).toMatchObject({
      deliveryCenterId: null,
      centerAssignStatus: 'NEED_CONFIRM',
      centerConfirmReason: 'REGION_UNASSIGNED',
    })
    // 목록: 확인 필요 거르기 · 건수
    const result = await listCustomersAction({
      ...createDataGridState(),
      filters: { needConfirm: 'Y' },
    })
    expect(result.ok && result.data.rows.map((r) => [r.code, r.needConfirmCount])).toEqual([
      ['A2', 1],
    ])
  })

  it('직접 지정: 이용 센터만, 권역과 다르면 불일치 표시', async () => {
    await assignZip('06236', icn)
    // 가나식품은 이천센터만 이용 → 화면 저장은 반려하지 않고 "확인 필요"로 둔다 (API 정책은 ③에서)
    const held = await create({
      shipTos: [shipTo({ centerMode: 'MANUAL', deliveryCenterId: String(gmh) })],
    })
    expect((await shipTosOf(held.id))[0]).toMatchObject({
      centerAssignStatus: 'NEED_CONFIRM',
      centerConfirmReason: 'NOT_CLIENT_CENTER',
    })
    // 다라상사는 이천·김해 이용 → 김해로 직접 지정 (권역은 이천)
    const created = await create({
      code: 'C2',
      shipperId: String(dara),
      shipTos: [shipTo({ centerMode: 'MANUAL', deliveryCenterId: String(gmh) })],
    })
    expect((await shipTosOf(created.id))[0]).toMatchObject({
      deliveryCenterId: gmh,
      regionCenterId: icn,
      centerAssignType: 'MANUAL',
      centerAssignStatus: 'ASSIGNED',
      regionMismatchYn: 'Y',
    })
  })

  it('수정: 납품처 추가·빼기·기본 바꾸기, 코드는 바꿀 수 없다, 주소를 안 바꾸면 지정 그대로', async () => {
    await assignZip('06236', icn)
    await assignZip('13529', gmh)
    const created = await create({ shipperId: String(dara), shipTos: [shipTo()] })
    const load = async () => (await getCustomerForEdit(BigInt(created.id), ALL))!
    let edit = await load()
    const [first] = edit.input.shipTos
    // 권역 배정을 바꿔도 주소를 안 바꾼 납품처는 다시 계산하지 않는다
    await assignZip('06236', gmh)
    const second = shipTo({
      code: 'S2',
      isDefault: true,
      zipCode: '13529',
      address: '경기 성남시 분당구 판교역로 166',
    })
    expect(
      await updateCustomerAction({
        ...edit.input,
        shipTos: [{ ...first, isDefault: false }, second],
        id: created.id,
        rowVersion: edit.rowVersion,
      }),
    ).toMatchObject({ ok: true })
    let rows = await shipTosOf(created.id)
    expect(rows.map((r) => [r.code, r.isDefault, r.deliveryCenterId])).toEqual([
      ['S1', 'N', icn],
      ['S2', 'Y', gmh],
    ])
    // 코드 바꾸기 → 거부
    edit = await load()
    expect(
      await updateCustomerAction({
        ...edit.input,
        shipTos: edit.input.shipTos.map((s) => (s.code === 'S1' ? { ...s, code: 'S9' } : s)),
        id: created.id,
        rowVersion: edit.rowVersion,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('바꿀 수 없') },
    })
    // S1 빼기 → 논리 삭제
    expect(
      await updateCustomerAction({
        ...edit.input,
        shipTos: edit.input.shipTos.filter((s) => s.code !== 'S1'),
        id: created.id,
        rowVersion: edit.rowVersion,
      }),
    ).toMatchObject({ ok: true })
    rows = await shipTosOf(created.id)
    expect(rows.map((r) => r.code)).toEqual(['S2'])
    expect(
      await prisma.shipTo.count({ where: { customerId: BigInt(created.id), delYn: 'Y' } }),
    ).toBe(1)
  })

  it('기본 납품처 동기화: 거래처 주소를 바꾸면 납품처 주소·배송센터도 다시 정한다', async () => {
    await assignZip('13529', icn)
    await assignZip('06236', gmh)
    const created = await create({ shipperId: String(dara) })
    expect((await shipTosOf(created.id))[0].deliveryCenterId).toBe(icn)
    const edit = (await getCustomerForEdit(BigInt(created.id), ALL))!
    expect(
      await updateCustomerAction({
        ...edit.input,
        zipCode: '06236',
        address: '서울 강남구 테헤란로 152',
        regionCode: '',
        id: created.id,
        rowVersion: edit.rowVersion,
      }),
    ).toMatchObject({ ok: true })
    expect((await shipTosOf(created.id))[0]).toMatchObject({
      zipCode: '06236',
      deliveryCenterId: gmh,
      addrSyncYn: 'Y',
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
    expect(await createCustomerAction(input({ code: 'X1' }))).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await getCustomerForEdit(BigInt(dara1.id), gmhScope)).not.toBeNull()
  })

  it('지우면 납품처도 함께 지우고, "삭제됨"에서 되살린다 (같은 코드가 다시 생겼으면 거부)', async () => {
    const a = await create({ code: 'C1' })
    expect(await deleteCustomersAction({ ids: [a.id] })).toEqual({ ok: true, data: { count: 1 } })
    expect(await prisma.shipTo.count({ where: { customerId: BigInt(a.id), delYn: 'N' } })).toBe(0)
    const b = await create({ code: 'C1' })
    expect(await restoreCustomersAction({ ids: [a.id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    await deleteCustomersAction({ ids: [b.id] })
    expect(await restoreCustomersAction({ ids: [a.id] })).toEqual({ ok: true, data: { count: 1 } })
    expect(await prisma.shipTo.count({ where: { customerId: BigInt(a.id), delYn: 'N' } })).toBe(1)
  })

  it('엑셀 전체 읽기는 엑셀 권한이 필요하다', async () => {
    signIn(ALL, ['master.customers.read'])
    expect(await listCustomersAction({ ...createDataGridState(), exportAll: true })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
