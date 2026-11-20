import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MILK_OPTIONS } from '@/test/item-input'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { getAsnForEdit } from '@/lib/inbound/asn-queries'
import type { AsnCreateInput } from '@/lib/inbound/asn-schema'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestShipper, versionOf, systemUnit } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createPortalAsnAction,
  deletePortalAsnsAction,
  updatePortalAsnAction,
} from '../../../portal/asn/actions'
import {
  createAsnAction,
  deleteAsnsAction,
  listAsnItemOptionsAction,
  updateAsnAction,
} from './actions'

// ASN 등록·수정·삭제 (docs/decisions/0048) — 운영사 화면(대리 등록) + 화주 포털

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
    userType: scope.kind === 'ALL' ? 'OPERATOR' : scope.kind === 'SHIPPER' ? 'SHIPPER' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let ids: {
  icn: bigint
  gmh: bigint
  gana: bigint // 이천센터만 이용
  dara: bigint
  water: bigint // EA 정수, BOX 24
  milk: bigint // 로트·유통기한 관리
  rice: bigint // KG 소수 3자리
  daraItem: bigint
}

beforeEach(async () => {
  await resetDatabase()
  const icn = await createTestCenter('ICN', { name: '이천센터' })
  const gmh = await createTestCenter('GMH', { name: '김해센터' })
  const gana = await createTestShipper('GANA')
  const dara = await createTestShipper('DARA')
  await prisma.shipper.update({
    where: { id: gana.id },
    data: { centers: { create: [{ centerId: icn.id }] } },
  })
  await prisma.shipper.update({
    where: { id: dara.id },
    data: { centers: { create: [{ centerId: gmh.id }] } },
  })
  // 시스템 기본 단위 (EA 0자리·KG 3자리·BOX·PLT, 0078)
  const unit = (code: string) => systemUnit(code)
  const ea = await unit('EA')
  const kg = await unit('KG')
  const box = await unit('BOX')
  const item = (shipperId: bigint, code: string, baseUnitId: bigint, data = {}) =>
    prisma.item.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        shipperId,
        systemCode: `IT-T-${code}`,
        code,
        name: code,
        baseUnitId,
        ...data,
      },
    })
  const water = await item(gana.id, 'WATER', ea.id, {
    units: { create: [{ unitId: box.id, convQty: '24' }] },
  })
  ids = {
    icn: icn.id,
    gmh: gmh.id,
    gana: gana.id,
    dara: dara.id,
    water: water.id,
    milk: (await item(gana.id, 'MILK', ea.id, MILK_OPTIONS)).id,
    rice: (await item(gana.id, 'RICE', kg.id)).id,
    daraItem: (await item(dara.id, 'DARA1', ea.id)).id,
  }
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const line = (overrides: Partial<AsnCreateInput['lines'][number]> = {}) => ({
  itemId: String(ids.water),
  unit: 'EA',
  qty: '10',
  lotNo: '',
  expiryOn: '',
  remark: '',
  ...overrides,
})

const input = (overrides: Partial<AsnCreateInput> = {}): AsnCreateInput => ({
  shipperId: String(ids.gana),
  centerId: String(ids.icn),
  expectedOn: '2026-11-20',
  shipperRefNo: 'PO-1',
  remark: '',
  lines: [line()],
  ...overrides,
})

async function create(overrides: Partial<AsnCreateInput> = {}) {
  const result = await createAsnAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

describe('대리 등록 (운영사 화면)', () => {
  it('ASN 번호 자동, 등록 경로 센터 대리, 단위 환산(BOX 3 = 72 EA)·입력 단위 기록', async () => {
    const created = await create({
      lines: [
        line({ unit: 'BOX', qty: '3' }),
        line({ itemId: String(ids.rice), unit: 'KG', qty: '2.5' }),
      ],
    })
    expect(created.asnNo).toMatch(/^AS\d{6}-\d{4}$/)
    const saved = await prisma.asn.findUniqueOrThrow({
      where: { id: BigInt(created.id) },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    })
    expect(saved).toMatchObject({
      channel: 'PROXY',
      status: 'PLANNED',
      shipperId: ids.gana,
      centerId: ids.icn,
      shipperRefNo: 'PO-1',
      createdBy: 'boss',
      operatorId: TEST_OPERATOR_ID,
    })
    expect(
      saved.lines.map((l) => [
        l.lineNo,
        l.expectedQty.toString(),
        l.entryUnit,
        l.entryQty?.toString(),
      ]),
    ).toEqual([
      [1, '72', 'BOX', '3'],
      [2, '2.5', null, undefined],
    ])
  })

  it('수량·단위 검사: 기본단위 소수 자리, 없는 단위, 다른 화주사 품목, 사용 중지 품목', async () => {
    const fail = async (lines: ReturnType<typeof line>[], message: string) =>
      expect(await createAsnAction(input({ lines }))).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION', message: expect.stringContaining(message) },
      })
    await fail([line({ qty: '2.5' })], '정수만')
    await fail([line({ unit: 'PLT' })], '없는 단위')
    await fail([line({ itemId: String(ids.daraItem) })], '이 화주사의 품목이 아닙니다')
    await fail([line(), line({ itemId: String(ids.rice), qty: '0.0005' })], '2번째 줄')
    await prisma.item.update({ where: { id: ids.water }, data: { status: 'INACTIVE' } })
    await fail([line()], '사용 중지된 품목')
    // 입력 규칙: 수량 0, 품목 없음
    expect((await createAsnAction(input({ lines: [line({ qty: '0' })] }))).ok).toBe(false)
    expect((await createAsnAction(input({ lines: [] }))).ok).toBe(false)
  })

  it('로트·유통기한: 관리 품목은 적을 수 있고(선택), 관리하지 않는 품목은 거부', async () => {
    await create({ lines: [line({ itemId: String(ids.milk) })] })
    await create({
      lines: [line({ itemId: String(ids.milk), lotNo: 'L1', expiryOn: '2027-01-31' })],
    })
    expect(await createAsnAction(input({ lines: [line({ lotNo: 'L1' })] }))).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('로트를 관리하지 않는') },
    })
  })

  it('센터: 화주사가 이용하는 센터만, 센터 직원은 소속 센터만', async () => {
    expect(await createAsnAction(input({ centerId: String(ids.gmh) }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('이용하는') },
    })
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [ids.gmh] })
    // 김해센터 직원: 가나는 김해를 이용하지 않아 범위 밖
    expect(await createAsnAction(input())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    // 다라는 김해를 이용한다
    expect(
      (
        await createAsnAction(
          input({
            shipperId: String(ids.dara),
            centerId: String(ids.gmh),
            lines: [line({ itemId: String(ids.daraItem) })],
          }),
        )
      ).ok,
    ).toBe(true)
  })

  it('품목 선택지: 화주사의 사용 중인 품목, 실제 적용되는 로트·유통기한, 환산단위', async () => {
    const result = await listAsnItemOptionsAction({ shipperId: String(ids.gana) })
    const rows = result.ok ? result.data : []
    expect(rows.map((r) => r.code)).toEqual(['MILK', 'RICE', 'WATER'])
    expect(rows.find((r) => r.code === 'WATER')).toMatchObject({
      baseUnit: { code: 'EA', decimals: 0 },
      units: [{ code: 'BOX', convQty: '24', decimals: 0 }],
      useLot: false,
    })
    expect(rows.find((r) => r.code === 'MILK')).toMatchObject({ useLot: true, useExpiry: true })
  })
})

describe('수정 · 지우기', () => {
  it('예정 상태에서만 고친다 (라인 통째로), 버전이 다르면 충돌', async () => {
    const created = await create()
    const { shipperId, ...rest } = input({ lines: [line({ unit: 'BOX', qty: '1' }), line()] })
    void shipperId
    expect(
      await updateAsnAction({
        ...rest,
        id: created.id,
        rowVersion: await versionOf('asn', created.id),
      }),
    ).toMatchObject({ ok: true })
    const edit = await getAsnForEdit(BigInt(created.id), ALL)
    expect(edit?.input.lines.map((l) => [l.unit, l.qty])).toEqual([
      ['BOX', '1'],
      ['EA', '10'],
    ])
    expect(await updateAsnAction({ ...rest, id: created.id, rowVersion: 1 })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })

    await prisma.asn.update({ where: { id: BigInt(created.id) }, data: { status: 'INSPECTING' } })
    expect(
      await updateAsnAction({
        ...rest,
        id: created.id,
        rowVersion: await versionOf('asn', created.id),
      }),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('검수가 시작된') } })
    expect(await deleteAsnsAction({ ids: [created.id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('예정 상태는 지운다 (논리 삭제 — 목록·수정 화면에서 사라진다)', async () => {
    const created = await create()
    expect(await deleteAsnsAction({ ids: [created.id] })).toEqual({ ok: true, data: { count: 1 } })
    expect(await getAsnForEdit(BigInt(created.id), ALL)).toBeNull()
    expect(
      (await prisma.asn.findFirst({ where: { id: BigInt(created.id), delYn: 'Y' } }))?.delYn,
    ).toBe('Y')
  })
})

describe('화주 포털', () => {
  const ganaScope = (): DataScope => ({
    kind: 'SHIPPER',
    operatorId: TEST_OPERATOR_ID,
    shipperId: ids.gana,
  })

  it('화주사는 자기 화주사로 정해지고 등록 경로는 화주 포털', async () => {
    signIn(ganaScope())
    const { shipperId, ...rest } = input()
    void shipperId
    const result = await createPortalAsnAction(rest)
    expect(result.ok).toBe(true)
    const saved = await prisma.asn.findFirstOrThrow()
    expect(saved).toMatchObject({ shipperId: ids.gana, channel: 'PORTAL' })
  })

  it('다른 화주사의 ASN은 보이지도 고쳐지지도 않는다', async () => {
    const other = await create({
      shipperId: String(ids.dara),
      centerId: String(ids.gmh),
      lines: [line({ itemId: String(ids.daraItem) })],
    })
    signIn(ganaScope())
    expect(await getAsnForEdit(BigInt(other.id), ganaScope())).toBeNull()
    const { shipperId, ...rest } = input()
    void shipperId
    expect(await updatePortalAsnAction({ ...rest, id: other.id, rowVersion: 1 })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await deletePortalAsnsAction({ ids: [other.id] })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })

  it('운영사 화면 사용자는 포털 액션을 쓸 수 없다 (권한 코드가 다르다)', async () => {
    signIn(ALL, ['inbound.asn.create'])
    const { shipperId, ...rest } = input()
    void shipperId
    expect(await createPortalAsnAction(rest)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
