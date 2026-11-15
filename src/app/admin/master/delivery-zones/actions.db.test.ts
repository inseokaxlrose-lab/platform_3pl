import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import type { DeliveryZoneInput } from '@/lib/delivery-zones/delivery-zone-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, versionOf } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import {
  createDeliveryZoneAction,
  deleteDeliveryZonesAction,
  listDeliveryZonesAction,
  setDeliveryZonesActiveAction,
  updateDeliveryZoneAction,
} from './actions'
import { getTakenRegions } from './queries'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const CODES: PermissionCode[] = [
  'master.delivery-zones.read',
  'master.delivery-zones.create',
  'master.delivery-zones.update',
  'master.delivery-zones.delete',
]

function signIn(scope: DataScope = { kind: 'ALL' }, codes = CODES) {
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

const input = (overrides: Partial<DeliveryZoneInput> = {}): DeliveryZoneInput => ({
  centerId: String(icnId),
  code: '',
  name: '서울 권역',
  description: '',
  regionCodes: ['11'],
  externalCodes: { SAP: '', ERP: '' },
  ...overrides,
})

async function create(overrides: Partial<DeliveryZoneInput> = {}) {
  const result = await createDeliveryZoneAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await resetDatabase()
  icnId = (await createTestCenter('ICN')).id
  gmhId = (await createTestCenter('GMH')).id
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('배송권역 등록·수정', () => {
  it('시스템 코드 자동, 코드를 비우면 시스템 코드, 담당 지역·외부 코드 함께 저장', async () => {
    const zone = await create({
      regionCodes: ['11', '41130', '11'],
      externalCodes: { SAP: 'Z100', ERP: '' },
    })
    expect(zone.systemCode).toMatch(/^DZ\d{6}$/)
    expect(zone.code).toBe(zone.systemCode)
    const regions = await prisma.deliveryZoneRegion.findMany({ where: { zoneId: BigInt(zone.id) } })
    expect(regions.map((r) => r.regionCode).sort()).toEqual(['11', '41130'])
    expect(await getExternalCodes('DELIVERY_ZONE', BigInt(zone.id))).toEqual({
      SAP: 'Z100',
      ERP: '',
    })
  })

  it('입력 규칙: 지역 1곳 이상, 모르는 지역 거부, 같은 권역 안 겹침 거부, 시스템 코드 모양 거부', async () => {
    expect(await createDeliveryZoneAction(input({ regionCodes: [] }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { regionCodes: [expect.stringContaining('1곳 이상')] } },
    })
    expect(await createDeliveryZoneAction(input({ regionCodes: ['99'] }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { regionCodes: [expect.stringContaining('알 수 없는')] } },
    })
    expect(await createDeliveryZoneAction(input({ regionCodes: ['11', '11110'] }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { regionCodes: [expect.stringContaining('겹칩니다')] } },
    })
    expect(await createDeliveryZoneAction(input({ code: 'DZ000999' }))).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('시스템 코드 모양') },
    })
  })

  it('같은 센터: 다른 권역(사용 중지 포함)과 지역이 겹치면 거부 / 다른 센터는 겹쳐도 된다', async () => {
    const seoul = await create({ code: 'SEOUL', regionCodes: ['11'] })
    await setDeliveryZonesActiveAction({ ids: [seoul.id], isActive: false })

    expect(
      await createDeliveryZoneAction(input({ code: 'JONGNO', regionCodes: ['11110'] })),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('서울특별시 전체(서울 권역)') },
    })
    // 다른 센터는 허용
    expect(
      await createDeliveryZoneAction(
        input({ centerId: String(gmhId), code: 'SEOUL', regionCodes: ['11'] }),
      ),
    ).toMatchObject({ ok: true })
    // 같은 센터 안 코드 중복은 거부
    expect(
      await createDeliveryZoneAction(input({ code: 'seoul', regionCodes: ['26'] })),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('수정: 담당 지역을 통째로 바꾸고, 자기 지역과는 겹침 검사를 하지 않는다 (센터는 그대로)', async () => {
    const zone = await create({ code: 'SEOUL', regionCodes: ['11'] })
    const result = await updateDeliveryZoneAction({
      id: zone.id,
      rowVersion: await versionOf('deliveryZone', zone.id),
      ...input({
        centerId: String(gmhId),
        code: 'SEOUL',
        name: '서울·인천',
        regionCodes: ['11', '28'],
      }),
    })
    expect(result).toMatchObject({ ok: true })
    const saved = await prisma.deliveryZone.findUniqueOrThrow({
      where: { id: BigInt(zone.id) },
      include: { regions: true },
    })
    expect(saved.centerId).toBe(icnId)
    expect(saved.name).toBe('서울·인천')
    expect(saved.regions.map((r) => r.regionCode).sort()).toEqual(['11', '28'])
  })
})

describe('목록 · 범위 · 일괄 처리', () => {
  it('센터·상태·시·도로 거르고, 담당 지역 코드·개수를 함께 준다', async () => {
    await create({ code: 'SEOUL', regionCodes: ['11'] })
    const gyeonggi = await create({
      code: 'SOUTH',
      name: '경기 남부',
      regionCodes: ['41130', '41460'],
    })
    await setDeliveryZonesActiveAction({ ids: [gyeonggi.id], isActive: false })
    await create({ centerId: String(gmhId), code: 'BUSAN', name: '부산', regionCodes: ['26'] })

    const codes = async (filters: Record<string, string>) => {
      const r = await listDeliveryZonesAction({ ...createDataGridState(), filters })
      return r.ok ? r.data.rows.map((z) => z.code).sort() : r.error
    }
    expect(await codes({ center: String(icnId) })).toEqual(['SEOUL', 'SOUTH'])
    expect(await codes({ status: 'INACTIVE' })).toEqual(['SOUTH'])
    expect(await codes({ sido: '41' })).toEqual(['SOUTH'])
    expect(await codes({ sido: 'xx' })).toEqual(['BUSAN', 'SEOUL', 'SOUTH'])

    const all = await listDeliveryZonesAction(createDataGridState())
    expect(all.ok && all.data.rows.find((z) => z.code === 'SOUTH')).toMatchObject({
      regionCodes: expect.arrayContaining(['41130', '41460']),
      regionCount: 2,
    })
  })

  it('센터 직원: 소속 센터 권역만 보고, 다른 센터 권역은 고치거나 추가·삭제할 수 없다', async () => {
    const busan = await create({ centerId: String(gmhId), code: 'BUSAN', regionCodes: ['26'] })
    await create({ code: 'SEOUL', regionCodes: ['11'] })
    signIn({ kind: 'CENTERS', centerIds: [icnId] })

    const list = await listDeliveryZonesAction(createDataGridState())
    expect(list.ok && list.data.rows.map((z) => z.code)).toEqual(['SEOUL'])
    expect(
      await createDeliveryZoneAction(input({ centerId: String(gmhId), regionCodes: ['27'] })),
    ).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await deleteDeliveryZonesAction({ ids: [busan.id] })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    // 이미 쓰는 지역 목록도 소속 센터 것만
    expect(Object.keys(await getTakenRegions({ kind: 'CENTERS', centerIds: [icnId] }))).toEqual([
      String(icnId),
    ])
  })

  it('삭제하면 담당 지역·외부 코드도 함께 지운다, 엑셀 전체는 엑셀 권한 필요', async () => {
    const zone = await create({ externalCodes: { SAP: 'Z1', ERP: '' } })
    expect(await deleteDeliveryZonesAction({ ids: [zone.id] })).toEqual({
      ok: true,
      data: { count: 1 },
    })
    expect(await prisma.deliveryZoneRegion.count()).toBe(0)
    expect(await prisma.externalCode.count()).toBe(0)
    expect(
      await listDeliveryZonesAction({ ...createDataGridState(), exportAll: true }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('사용 중지된 센터에는 권역을 추가할 수 없다', async () => {
    await prisma.center.update({ where: { id: gmhId }, data: { isActive: false } })
    expect(await createDeliveryZoneAction(input({ centerId: String(gmhId) }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })
})
