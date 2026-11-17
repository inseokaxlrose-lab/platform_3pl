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
import { createCustomerAction, updateCustomerAction } from '../customers/actions'
import { applyRegionAssignAction, previewRegionAssignAction } from '../regions/actions'
import {
  assignShipTosCenterAction,
  listShipTosAction,
  reassignShipTosAutoAction,
  renormalizeShipTosAction,
} from './actions'

// 납품처 목록·일괄 처리, 권역설정 변경 연동 (docs/decisions/0082 ②)

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

const shipToOf = async (customerId: string) =>
  prisma.shipTo.findFirstOrThrow({ where: { customerId: BigInt(customerId), delYn: 'N' } })

// 권역설정 화면의 [저장]과 같은 경로: 표에서 우편번호를 골라 센터 지정
async function regionSave(zips: string[], centerId: bigint | null) {
  const input = {
    target: { kind: 'zips' as const, source: 'GRID' as const, zips },
    tempZone: 'ALL',
    centerId: centerId === null ? null : String(centerId),
  }
  const preview = await previewRegionAssignAction(input)
  if (!preview.ok) throw new Error(preview.error.message)
  const saved = await applyRegionAssignAction(input)
  if (!saved.ok) throw new Error(saved.error.message)
  return { impact: preview.data.shipToImpact, notice: saved.data.shipToNotice }
}

describe('권역설정 변경 연동', () => {
  it('권역 자동 납품처: 미리보기에 영향 건수, 저장하면 새 센터로 다시 정한다', async () => {
    await assignZip('13529', icn)
    const customer = await create({ shipperId: String(dara) })
    expect((await shipToOf(customer.id)).deliveryCenterId).toBe(icn)
    const version = (
      await prisma.customer.findUniqueOrThrow({ where: { id: BigInt(customer.id) } })
    ).rowVersion

    const { impact, notice } = await regionSave(['13529'], gmh)
    expect(impact).toContain('자동 지정 납품처 1곳 센터 변경')
    expect(notice).toContain('납품처 1곳')
    expect(await shipToOf(customer.id)).toMatchObject({
      deliveryCenterId: gmh,
      regionCenterId: gmh,
      centerAssignType: 'AUTO',
      centerAssignStatus: 'ASSIGNED',
    })
    // 열어 둔 거래처 화면이 옛 지정으로 덮어쓰지 못하게 거래처 버전도 오른다
    expect(
      (await prisma.customer.findUniqueOrThrow({ where: { id: BigInt(customer.id) } })).rowVersion,
    ).toBe(version + 1)
  })

  it('수동 지정 납품처: 센터는 그대로, 권역 기준 센터와 불일치만 새로', async () => {
    await assignZip('06236', icn)
    const customer = await create({
      shipperId: String(dara),
      shipTos: [shipTo({ centerMode: 'MANUAL', deliveryCenterId: String(icn) })],
    })
    expect((await shipToOf(customer.id)).regionMismatchYn).toBe('N')
    const { impact } = await regionSave(['06236'], gmh)
    expect(impact).toContain('수동·연동 지정 납품처 1곳 권역 불일치 발생')
    expect(await shipToOf(customer.id)).toMatchObject({
      deliveryCenterId: icn,
      regionCenterId: gmh,
      centerAssignType: 'MANUAL',
      regionMismatchYn: 'Y',
    })
  })

  it('확인 필요 납품처: 그 지역을 배정하면 다시 시도해 지정 완료가 된다', async () => {
    await assignZip('06236', null)
    const customer = await create({ shipTos: [shipTo()] })
    expect((await shipToOf(customer.id)).centerAssignStatus).toBe('NEED_CONFIRM')
    const { impact } = await regionSave(['06236'], icn)
    expect(impact).toContain('확인 필요 납품처 1곳 다시 지정')
    expect(await shipToOf(customer.id)).toMatchObject({
      deliveryCenterId: icn,
      centerAssignType: 'AUTO',
      centerAssignStatus: 'ASSIGNED',
      centerConfirmReason: null,
    })
  })
})

describe('납품처 목록 · 일괄 처리', () => {
  it('빠른 보기 "확인 필요"로 모아 보고, 배송센터 일괄 지정(이용 센터가 아니면 건너뜀)', async () => {
    await assignZip('06236', null)
    const gana1 = await create({ code: 'G1', shipTos: [shipTo()] })
    const dara1 = await create({ code: 'D1', shipperId: String(dara), shipTos: [shipTo()] })
    const listed = await listShipTosAction({
      ...createDataGridState(),
      filters: { view: 'NEED_CONFIRM' },
    })
    expect(listed.ok && listed.data.rows.map((r) => r.customerCode).sort()).toEqual(['D1', 'G1'])
    const ids = listed.ok ? listed.data.rows.map((r) => r.id) : []

    // 김해센터: 다라만 이용 → 가나 납품처는 건너뛴다
    const result = await assignShipTosCenterAction({ ids, centerId: String(gmh) })
    expect(result).toMatchObject({
      ok: true,
      data: {
        total: 2,
        assigned: 1,
        skipped: [{ customerCode: 'G1', reason: 'NOT_CLIENT_CENTER' }],
      },
    })
    expect(await shipToOf(dara1.id)).toMatchObject({
      deliveryCenterId: gmh,
      centerAssignType: 'MANUAL',
      centerAssignStatus: 'ASSIGNED',
    })
    expect((await shipToOf(gana1.id)).centerAssignStatus).toBe('NEED_CONFIRM')
  })

  it('권역 기준으로 재지정: 수동 지정을 버리고 권역 자동으로, 재정제는 지정 구분을 지킨다', async () => {
    await assignZip('06236', icn)
    const customer = await create({
      shipperId: String(dara),
      shipTos: [shipTo({ centerMode: 'MANUAL', deliveryCenterId: String(gmh) })],
    })
    const { id } = await shipToOf(customer.id)
    expect(await renormalizeShipTosAction({ ids: [String(id)] })).toMatchObject({ ok: true })
    expect(await shipToOf(customer.id)).toMatchObject({
      deliveryCenterId: gmh,
      centerAssignType: 'MANUAL',
      regionMismatchYn: 'Y',
    })
    expect(await reassignShipTosAutoAction({ ids: [String(id)] })).toMatchObject({
      ok: true,
      data: { changed: 1, assigned: 1 },
    })
    expect(await shipToOf(customer.id)).toMatchObject({
      deliveryCenterId: icn,
      centerAssignType: 'AUTO',
      regionMismatchYn: 'N',
    })
  })

  it('거래처 화면을 열어 둔 채 일괄 처리하면 그 화면의 저장은 충돌로 막힌다', async () => {
    await assignZip('06236', icn)
    const customer = await create({ shipperId: String(dara), shipTos: [shipTo()] })
    const edit = (await getCustomerForEdit(BigInt(customer.id), ALL))!
    const { id } = await shipToOf(customer.id)
    await assignShipTosCenterAction({ ids: [String(id)], centerId: String(gmh) })
    expect(
      await updateCustomerAction({ ...edit.input, id: customer.id, rowVersion: edit.rowVersion }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('범위 밖 납품처는 일괄 처리할 수 없다', async () => {
    await assignZip('06236', icn)
    const gana1 = await create({ shipTos: [shipTo()] })
    const { id } = await shipToOf(gana1.id)
    // 김해센터 직원: 가나는 김해를 이용하지 않는다
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [gmh] })
    expect(await reassignShipTosAutoAction({ ids: [String(id)] })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })
})
