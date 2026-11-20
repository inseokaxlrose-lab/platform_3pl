import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { withoutCode, type CenterCreateInput } from '@/lib/centers/center-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import { centerTestInput } from '@/test/center-input'
import { createTestCodeGroup, createTestShipper, versionOf } from '@/test/factories'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  changeCenterStatusAction,
  changeCentersStatusAction,
  createCenterAction,
  deleteCenterAction,
  listCentersAction,
  updateCenterAction,
} from './actions'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL_CODES: PermissionCode[] = [
  'master.centers.read',
  'master.centers.create',
  'master.centers.update',
  'master.centers.delete',
]

function signIn(
  scope: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID },
  codes = ALL_CODES,
) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

const input = centerTestInput

async function create(overrides: Partial<CenterCreateInput> = {}) {
  const result = await createCenterAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

// 수정 입력: 지금 저장된 기본 로케이션을 그대로 넣는다 (기본 입고 로케이션 필수)
async function update(id: string, overrides: Partial<CenterCreateInput> = {}, rowVersion?: number) {
  const saved = await prisma.center.findUniqueOrThrow({ where: { id: BigInt(id) } })
  const rest = withoutCode(
    input({
      defaultInboundLocId: saved.defaultInboundLocId?.toString() ?? '',
      defaultOutboundLocId: saved.defaultOutboundLocId?.toString() ?? '',
      defaultReturnLocId: saved.defaultReturnLocId?.toString() ?? '',
      ...overrides,
    }),
  )
  return updateCenterAction({
    id,
    rowVersion: rowVersion ?? (await versionOf('center', id)),
    ...rest,
  })
}

const status = async (id: string) =>
  (await prisma.center.findUniqueOrThrow({ where: { id: BigInt(id) } })).status

beforeEach(async () => {
  await resetDatabase()
  await createTestCodeGroup('CENTER_CONTACT_ROLE', [{ code: 'MANAGER' }, { code: 'INBOUND' }])
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('센터 등록', () => {
  it('준비중으로 시작, 대기 창고 3개·DEFAULT 로케이션을 만들고 기본 로케이션 3칸을 연결한다', async () => {
    const center = await create()

    expect(center.code).toBe('ICN')
    const saved = await prisma.center.findUniqueOrThrow({ where: { id: BigInt(center.id) } })
    expect(saved).toMatchObject({ status: 'PREPARING', workDays: 'YYYYYNN', bondedYn: 'N' })
    const warehouses = await prisma.warehouse.findMany({
      where: { centerId: BigInt(center.id) },
      include: { locations: true },
      orderBy: { type: 'asc' },
    })
    expect(warehouses.map((w) => [w.code, w.type, w.locations.map((l) => l.code)])).toEqual([
      ['INBOUND', 'INBOUND', ['DEFAULT']],
      ['OUTBOUND', 'OUTBOUND', ['DEFAULT']],
      ['RETURN', 'RETURN', ['DEFAULT']],
    ])
    const locationOf = (type: string) => warehouses.find((w) => w.type === type)!.locations[0].id
    expect(saved.defaultInboundLocId).toBe(locationOf('INBOUND'))
    expect(saved.defaultOutboundLocId).toBe(locationOf('OUTBOUND'))
    expect(saved.defaultReturnLocId).toBe(locationOf('RETURN'))
    // 기본 로케이션 연결로 올라간 버전을 돌려줘야 바로 수정할 수 있다
    expect(center.rowVersion).toBe(saved.rowVersion)
  })

  it('번호는 숫자만, 시각·온도대·담당자도 함께 저장', async () => {
    const center = await create({
      workStartTime: '08:00',
      shipCutoffTime: '16:30',
      tempZones: ['AMBIENT', 'FROZEN', 'AMBIENT'],
      contacts: [
        { duty: 'MANAGER', name: '김센터', phone: '010-1111-2222', email: '', isPrimary: true },
      ],
    })
    const saved = await prisma.center.findUniqueOrThrow({
      where: { id: BigInt(center.id) },
      include: { tempZones: true, contacts: true },
    })
    expect(saved).toMatchObject({ phone: '0311234567', fax: null, regionName: '경기 이천시' })
    expect(saved.workStartTime?.toISOString().slice(11, 16)).toBe('08:00')
    expect(saved.shipCutoffTime?.toISOString().slice(11, 16)).toBe('16:30')
    expect(saved.tempZones.map((z) => z.tempZoneCd).sort()).toEqual(['AMBIENT', 'FROZEN'])
    expect(saved.contacts).toEqual([
      expect.objectContaining({
        duty: 'MANAGER',
        phone: '01011112222',
        isPrimary: 'Y',
        createdBy: 'boss',
      }),
    ])
  })

  it('센터코드: 필수, 소문자는 대문자로, 중복·영문 대문자·숫자 외는 거부', async () => {
    expect((await create({ code: 'gmh1' })).code).toBe('GMH1')
    await create({ code: 'ICN' })
    expect(await createCenterAction(input({ code: 'icn' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('ICN') },
    })
    expect(await createCenterAction(input({ code: 'ICN-1', name: '' }))).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: { code: [expect.any(String)], name: [expect.any(String)] },
      },
    })
    expect(await createCenterAction(input({ code: '' }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: [expect.any(String)] } },
    })
  })

  it('주소 필수, 없는 담당 업무 코드는 거부', async () => {
    expect(await createCenterAction(input({ zipCode: '', address: '' }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { address: [expect.any(String)] } },
    })
    expect(
      await createCenterAction(
        input({
          contacts: [
            { duty: 'NOPE', name: '김', phone: '010-1111-2222', email: '', isPrimary: true },
          ],
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('운영사 센터 수 제한 (요금제)', async () => {
    await prisma.operator.update({ where: { id: TEST_OPERATOR_ID }, data: { maxCenterCount: 1 } })
    await create({ code: 'AAA' })
    expect(await createCenterAction(input({ code: 'BBB' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('최대 1개') },
    })
  })
})

describe('센터 수정', () => {
  it('코드는 바뀌지 않고, 다른 사람이 먼저 고쳤으면 덮어쓰지 않는다 (외부 코드는 그대로)', async () => {
    const center = await create()
    await prisma.externalCode.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        system: 'SAP',
        entityType: 'CENTER',
        entityId: BigInt(center.id),
        code: '1000',
      },
    })
    const v = center.rowVersion
    const first = await update(center.id, { name: '먼저' }, v)
    expect(first).toMatchObject({ ok: true, data: { rowVersion: v + 1, code: 'ICN' } })
    expect(await update(center.id, { name: '나중' }, v)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('다른 사람이 먼저 고쳤습니다') },
    })
    const saved = await prisma.center.findUniqueOrThrow({ where: { id: BigInt(center.id) } })
    expect(saved).toMatchObject({ name: '먼저', code: 'ICN', updatedBy: 'boss' })
    expect(await getExternalCodes('CENTER', BigInt(center.id))).toEqual({ SAP: '1000', ERP: '' })
  })

  it('담당자: 줄 키로 고치면 등록 정보가 남고, 빠진 줄은 지운다', async () => {
    const center = await create({
      contacts: [
        { duty: 'MANAGER', name: '김', phone: '010-1111-2222', email: '', isPrimary: true },
        { duty: 'INBOUND', name: '이', phone: '010-3333-4444', email: '', isPrimary: false },
      ],
    })
    const [kim] = await prisma.centerContact.findMany({
      where: { centerId: BigInt(center.id) },
      orderBy: { sortOrder: 'asc' },
    })
    const result = await update(center.id, {
      contacts: [
        {
          id: kim.id.toString(),
          duty: 'MANAGER',
          name: '김수정',
          phone: '010-1111-2222',
          email: '',
          isPrimary: false,
        },
        { duty: 'INBOUND', name: '박', phone: '', email: 'p@x.kr', isPrimary: true },
      ],
    })
    expect(result.ok).toBe(true)
    const rows = await prisma.centerContact.findMany({
      where: { centerId: BigInt(center.id) },
      orderBy: { sortOrder: 'asc' },
    })
    expect(rows.map((r) => [r.name, r.isPrimary])).toEqual([
      ['김수정', 'N'],
      ['박', 'Y'],
    ])
    expect(rows[0]).toMatchObject({ id: kim.id, createdAt: kim.createdAt })
    // 화면이 새 줄에 키를 채울 수 있게 저장 순서대로 줄 키를 준다
    expect(result.ok && result.data.contactIds).toEqual(rows.map((r) => r.id.toString()))
  })

  it('기본 로케이션: 기본 입고 필수, 다른 센터의 로케이션은 거부', async () => {
    const icn = await create()
    const gmh = await create({ code: 'GMH', name: '김해' })
    const other = await prisma.center.findUniqueOrThrow({ where: { id: BigInt(gmh.id) } })
    expect(await update(icn.id, { defaultInboundLocId: '' })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('기본 입고 로케이션') },
    })
    expect(
      await update(icn.id, { defaultOutboundLocId: other.defaultOutboundLocId!.toString() }),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('이 센터의') } })
  })
})

describe('운영 상태', () => {
  it('일시중지·폐쇄는 사유, 폐쇄는 운영 종료일 필수, 운영중으로 돌아가면 사유를 지운다', async () => {
    const center = await create()
    const change = async (s: string, reason = '', closedOn = '') =>
      changeCenterStatusAction({
        id: center.id,
        rowVersion: await versionOf('center', center.id),
        status: s,
        reason,
        closedOn,
      })
    expect(await change('SUSPENDED')).toMatchObject({
      ok: false,
      error: { fieldErrors: { reason: [expect.any(String)] } },
    })
    expect(await change('SUSPENDED', '점검')).toMatchObject({ ok: true })
    expect(
      await prisma.center.findUniqueOrThrow({ where: { id: BigInt(center.id) } }),
    ).toMatchObject({ status: 'SUSPENDED', statusReason: '점검' })
    expect(await change('ACTIVE')).toMatchObject({ ok: true })
    expect(
      await prisma.center.findUniqueOrThrow({ where: { id: BigInt(center.id) } }),
    ).toMatchObject({ status: 'ACTIVE', statusReason: null })
    expect(await change('CLOSED', '이전')).toMatchObject({
      ok: false,
      error: { fieldErrors: { closedOn: [expect.any(String)] } },
    })
    expect(await change('CLOSED', '이전', '2026-12-31')).toMatchObject({ ok: true })
    const closed = await prisma.center.findUniqueOrThrow({ where: { id: BigInt(center.id) } })
    expect(closed.closedOn?.toISOString().slice(0, 10)).toBe('2026-12-31')
  })

  it('끝나지 않은 입고가 있으면 폐쇄할 수 없다', async () => {
    const center = await create()
    const shipper = await createTestShipper('GANA')
    await prisma.asn.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        centerId: BigInt(center.id),
        shipperId: shipper.id,
        asnNo: 'AS-T-1',
        channel: 'PROXY',
        expectedOn: new Date('2026-11-20'),
        status: 'PLANNED',
      },
    })
    expect(
      await changeCenterStatusAction({
        id: center.id,
        rowVersion: await versionOf('center', center.id),
        status: 'CLOSED',
        reason: '이전',
        closedOn: '2026-12-31',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('입고(ASN) 1건') },
    })
  })

  it('권역설정에 배정된 우편번호가 있으면 폐쇄할 수 없고, 배정에 쓰인 온도대는 뺄 수 없다 (0076)', async () => {
    const center = await create({ tempZones: ['AMBIENT', 'FROZEN'] })
    const centerId = BigInt(center.id)
    await prisma.regionZip.create({
      data: {
        code: '06236',
        sidoCode: '11',
        sigunguCode: '11680',
        firstLoadVer: 'T',
        lastLoadVer: 'T',
      },
    })
    const batch = await prisma.regionChangeBatch.create({
      data: { operatorId: TEST_OPERATOR_ID, changeType: 'GRID_ASSIGN', scopeDesc: '테스트' },
    })
    await prisma.regionCenterMap.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        zipCode: '06236',
        tempZone: 'FROZEN',
        centerId,
        lastBatchId: batch.id,
      },
    })
    expect(
      await changeCenterStatusAction({
        id: center.id,
        rowVersion: await versionOf('center', center.id),
        status: 'CLOSED',
        reason: '이전',
        closedOn: '2026-12-31',
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: expect.stringContaining('권역설정에 배정된 우편번호 1개'),
      },
    })
    expect(await update(center.id, { tempZones: ['AMBIENT'] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('냉동 1건') },
    })
  })

  it('일괄 운영중·일시중지: 운영사만, 일시중지는 사유, 폐쇄된 센터는 건너뜀, 하나라도 없으면 전체 거부', async () => {
    const a = await create({ code: 'AAA' })
    const b = await create({ code: 'BBB' })
    await prisma.center.update({
      where: { id: BigInt(b.id) },
      data: { status: 'CLOSED', statusReason: '이전', closedOn: new Date('2026-01-01') },
    })
    expect(
      await changeCentersStatusAction({ ids: [a.id, b.id], status: 'SUSPENDED', reason: '' }),
    ).toMatchObject({ ok: false, error: { fieldErrors: { reason: [expect.any(String)] } } })
    expect(
      await changeCentersStatusAction({ ids: [a.id, b.id], status: 'SUSPENDED', reason: '점검' }),
    ).toEqual({ ok: true, data: { count: 1 } })
    expect([await status(a.id), await status(b.id)]).toEqual(['SUSPENDED', 'CLOSED'])

    expect(
      await changeCentersStatusAction({ ids: [a.id, '999999'], status: 'ACTIVE', reason: '' }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })

    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [BigInt(a.id)] })
    expect(
      await changeCentersStatusAction({ ids: [a.id], status: 'ACTIVE', reason: '' }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})

describe('삭제', () => {
  it('쓰인 적 없는 센터만 지운다 (대기 창고·로케이션도 함께 숨김), 쓰였으면 폐쇄로 안내', async () => {
    const empty = await create({ code: 'AAA' })
    expect(await deleteCenterAction({ id: empty.id })).toMatchObject({ ok: true })
    const gone = await prisma.center.findFirst({ where: { id: BigInt(empty.id), delYn: 'Y' } })
    expect(gone).not.toBeNull()
    expect(
      await prisma.warehouse.count({ where: { centerId: BigInt(empty.id), delYn: 'N' } }),
    ).toBe(0)

    const used = await create({ code: 'BBB' })
    const shipper = await createTestShipper('GANA')
    await prisma.shipperCenter.create({
      data: { shipperId: shipper.id, centerId: BigInt(used.id) },
    })
    expect(await deleteCenterAction({ id: used.id })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('폐쇄') },
    })
  })
})

describe('목록 · 데이터 범위 · 권한', () => {
  const list = (filters: Record<string, string>, extra = {}) =>
    listCentersAction({ ...createDataGridState(), filters, ...extra })
  const codes = async (filters: Record<string, string>) => {
    const result = await list(filters)
    return result.ok ? result.data.rows.map((r) => r.code).sort() : result.error
  }

  it('목록: 정렬순서 → 코드, 대표 담당자·온도대·로케이션 수(대기 창고 제외)를 준다', async () => {
    await create({
      code: 'ICN',
      sortOrder: 20,
      tempZones: ['FROZEN'],
      contacts: [
        { duty: 'MANAGER', name: '김', phone: '010-1111-2222', email: '', isPrimary: true },
      ],
    })
    await create({ code: 'GMH', name: '김해센터', sortOrder: 10 })
    const result = await list({})
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual(['GMH', 'ICN'])
    expect(result.ok && result.data.rows[1]).toMatchObject({
      manager: '김',
      tempZones: ['FROZEN'],
      locationCount: 0,
      shipperCount: 0,
      status: 'PREPARING',
    })
  })

  it('상태·유형·지역·온도대·보세·등록일로 거른다', async () => {
    const icn = await create({ code: 'ICN', tempZones: ['FROZEN'], bondedYn: true })
    await create({ code: 'GMH', name: '김해', type: 'OWN', regionName: '경남 김해시' })
    await prisma.center.update({ where: { id: BigInt(icn.id) }, data: { status: 'ACTIVE' } })

    expect(await codes({ status: 'ACTIVE' })).toEqual(['ICN'])
    expect(await codes({ status: 'PREPARING,ACTIVE' })).toEqual(['GMH', 'ICN'])
    expect(await codes({ type: 'OWN' })).toEqual(['GMH'])
    expect(await codes({ region: '김해' })).toEqual(['GMH'])
    expect(await codes({ tempZone: 'FROZEN,CHILLED' })).toEqual(['ICN'])
    expect(await codes({ bonded: 'Y' })).toEqual(['ICN'])
    expect(await codes({ createdAt: '2000-01-01~2000-01-02' })).toEqual([])
  })

  it('센터 직원: 소속 센터만 보이고, 다른 센터는 고칠 수 없다. 등록·상태 변경·삭제는 운영사만', async () => {
    const icn = await create({ code: 'ICN' })
    const gmh = await create({ code: 'GMH', name: '김해센터' })
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [BigInt(icn.id)] })

    const result = await list({})
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual(['ICN'])
    expect(await update(gmh.id)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await update(icn.id)).toMatchObject({ ok: true })
    expect(await createCenterAction(input({ code: 'NEW' }))).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(
      await changeCenterStatusAction({
        id: icn.id,
        rowVersion: await versionOf('center', icn.id),
        status: 'ACTIVE',
        reason: '',
        closedOn: '',
      }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(await deleteCenterAction({ id: icn.id })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })

  it('권한이 없으면 거부, 엑셀 전체 읽기는 엑셀 권한', async () => {
    await create({ code: 'AAA' })
    await create({ code: 'BBB' })
    signIn({ kind: 'ALL', operatorId: TEST_OPERATOR_ID }, ['master.centers.read'])
    expect(await createCenterAction(input({ code: 'CCC' }))).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(await list({}, { exportAll: true })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    signIn({ kind: 'ALL', operatorId: TEST_OPERATOR_ID }, [...ALL_CODES, 'master.centers.export'])
    const result = await list({}, { exportAll: true, pageIndex: 5 })
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual(['AAA', 'BBB'])
  })
})
