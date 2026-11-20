import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import type { UploadRow } from '@/lib/excel/upload'
import { getAsnItemOptions } from '@/lib/inbound/asn-queries'
import type { ItemInput } from '@/lib/items/item-schema'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestShipper, systemUnit } from '@/test/factories'
import { barcodeRow, itemInput, unitRow } from '@/test/item-input'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  applyPalletBulkAction,
  commitItemUploadAction,
  createItemAction,
  listItemsAction,
  setItemsStatusAction,
  validateItemUploadAction,
} from './actions'

// 품목 목록·일괄 처리·엑셀 업로드 (docs/decisions/0083 ②)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }

function signIn(codes: PermissionCode[] = [...ALL_PERMISSION_CODES], scope: DataScope = ALL) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let gana = 0n
let ea = 0n
let box = 0n

const BOX_SIZE = { widthCm: '30', depthCm: '20', heightCm: '25', grossWeightKg: '12' }
const EAN_A = '8801234567893'

async function create(code: string, overrides: Partial<ItemInput> = {}) {
  const result = await createItemAction({
    shipperId: String(gana),
    code,
    ...itemInput(ea, overrides),
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.data.id
}

const rows = async (filters: Record<string, string> = {}) => {
  const result = await listItemsAction({ ...createDataGridState(), filters })
  if (!result.ok) throw new Error(result.error.message)
  return result.data.rows
}
const codes = async (filters: Record<string, string> = {}) =>
  (await rows(filters)).map((r) => r.code)

const savedItem = (code: string) =>
  prisma.item.findFirstOrThrow({
    where: { shipperId: gana, code },
    include: {
      units: { orderBy: { sortOrder: 'asc' }, include: { unit: { select: { code: true } } } },
      barcodes: { orderBy: { id: 'asc' } },
    },
  })

// 엑셀 행 (2행부터)
const upload = (...values: Record<string, string>[]): UploadRow[] =>
  values.map((v, i) => ({ rowNo: i + 2, values: { shipperCode: 'GANA', ...v } }))

beforeEach(async () => {
  await resetDatabase()
  ea = (await systemUnit('EA')).id
  box = (await systemUnit('BOX')).id
  gana = (await createTestShipper('GANA')).id
  // 화주사 기한 관리 안 함, LOT 안 함 (기본)
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('품목 목록 (0083 ②)', () => {
  beforeEach(async () => {
    // SIZED: BOX 규격 + 팔레트 → 체적 등록·PLT 있음 / NOSIZE: BOX만 / BASEONLY: 기본단위만
    await create('SIZED', {
      units: [unitRow('BASE', ea, '1'), unitRow('BOX', box, '24', BOX_SIZE)],
      palletTypeCode: 'T11',
      palletTi: 10,
      palletHi: 5,
      tempZone: 'CHILLED',
      itemType: 'PRODUCT',
    })
    await create('NOSIZE', { units: [unitRow('BASE', ea, '1'), unitRow('BOX', box, '12')] })
    await create('BASEONLY')
  })

  it('새 칸: BOX 입수·PLT 입수(BOX)·BOX CBM·중량·온도대·유형·체적 상태·상태', async () => {
    const sized = (await rows()).find((r) => r.code === 'SIZED')
    expect(sized).toMatchObject({
      itemType: '제품',
      boxQty: '24',
      pltBoxQty: '50',
      boxCbm: '0.015',
      boxWeightKg: '12',
      tempZone: '냉장',
      volumeStatus: 'OK',
      status: 'ACTIVE',
      source: '운영사 화면',
    })
    expect((await rows()).find((r) => r.code === 'NOSIZE')).toMatchObject({
      boxQty: '12',
      pltBoxQty: null,
      volumeStatus: 'MISSING',
    })
  })

  it('체적 미등록·PLT 미등록·온도대·유형으로 거른다', async () => {
    expect(await codes({ volumeMissing: 'Y' })).toEqual(['BASEONLY', 'NOSIZE'])
    expect(await codes({ volumeMissing: 'N' })).toEqual(['SIZED'])
    expect(await codes({ pltMissing: 'Y' })).toEqual(['BASEONLY', 'NOSIZE'])
    expect(await codes({ tempZone: 'CHILLED,FROZEN' })).toEqual(['SIZED'])
    expect(await codes({ itemType: 'GOODS' })).toEqual(['BASEONLY', 'NOSIZE'])
  })

  it('상태 일괄 변경: 단종은 거르기·배지로 보이고, 새 입고예정의 품목 고르기에서 빠진다', async () => {
    const id = (await rows()).find((r) => r.code === 'NOSIZE')!.id
    expect(await setItemsStatusAction({ ids: [id], status: 'DISCONTINUED' })).toEqual({
      ok: true,
      data: { count: 1 },
    })
    expect(await codes({ status: 'DISCONTINUED' })).toEqual(['NOSIZE'])
    expect(await codes({ status: 'ACTIVE' })).toEqual(['BASEONLY', 'SIZED'])
    const options = await getAsnItemOptions(gana, ALL)
    expect(options.map((o) => o.code)).toEqual(['BASEONLY', 'SIZED'])
  })
})

describe('팔레트 적재 일괄 입력 (0083 ②)', () => {
  it('BOX가 있는 품목에만 적용해 PLT를 계산하고, 없는 품목은 건너뛰고 사유를 알린다', async () => {
    const a = await create('A', {
      units: [unitRow('BASE', ea, '1'), unitRow('BOX', box, '24', BOX_SIZE)],
    })
    const b = await create('B')
    const result = await applyPalletBulkAction({
      ids: [a, b],
      palletTypeCode: 'T11',
      palletTi: 10,
      palletHi: 8,
      palletBoxQty: null,
    })
    // HI 8 → 높이 215cm > 권장 180cm 경고
    expect(result).toEqual({
      ok: true,
      data: {
        total: 2,
        applied: 1,
        warned: 1,
        skipped: [{ code: 'B', reason: 'BOX 단위가 없습니다' }],
      },
    })
    const saved = await savedItem('A')
    expect(saved).toMatchObject({
      palletTypeCode: 'T11',
      palletTi: 10,
      palletHi: 8,
      palletBoxQty: 80,
    })
    expect(saved.units.find((u) => u.level === 'PLT')?.convQty.toString()).toBe('1920')
  })

  it('TI·HI도 박스 수도 없으면 거부', async () => {
    const a = await create('A', { units: [unitRow('BASE', ea, '1'), unitRow('BOX', box, '24')] })
    expect(
      await applyPalletBulkAction({
        ids: [a],
        palletTypeCode: 'T11',
        palletTi: 10,
        palletHi: null,
        palletBoxQty: null,
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })
})

describe('품목 엑셀 업로드 (0083 ②)', () => {
  const NEW_ROW = {
    code: 'new-1',
    name: '새 생수',
    baseUnit: 'EA',
    boxQty: '24',
    boxWidth: '30',
    boxDepth: '20',
    boxHeight: '25',
    boxWeight: '12',
    palletType: 'T11',
    palletTi: '10',
    palletHi: '5',
    useExpiry: 'Y',
    baseBarcode: EAN_A,
  }

  it('미리보기는 저장하지 않고 요약을 보여 주고, 등록하면 새 품목은 만들고 기존 품목은 넣은 칸만 고친다', async () => {
    await create('OLD', {
      units: [unitRow('BASE', ea, '1'), unitRow('BOX', box, '6', BOX_SIZE)],
      spec: '옛 규격',
    })
    const file = upload(NEW_ROW, { code: 'OLD', name: '이름만 바꿈' })

    const preview = await validateItemUploadAction(file)
    expect(preview).toMatchObject({
      ok: true,
      data: { errorCount: 0, summary: expect.stringContaining('신규 1 · 수정 1 · 변경 없음 0') },
    })
    expect(await prisma.item.count({ where: { code: 'NEW-1' } })).toBe(0)

    expect(await commitItemUploadAction(file)).toMatchObject({
      ok: true,
      data: { message: expect.stringContaining('신규 1 · 수정 1') },
    })
    const created = await savedItem('NEW-1')
    expect(created).toMatchObject({
      name: '새 생수',
      source: 'UPLOAD',
      useExpiry: 'Y',
      expiryType: 'CONSUME',
      expiryInput: 'EXPIRY',
      palletBoxQty: 50,
    })
    expect(created.units.map((u) => [u.level, u.unit.code, u.convQty.toString()])).toEqual([
      ['BASE', 'EA', '1'],
      ['BOX', 'BOX', '24'],
      ['PLT', 'PLT', '1200'],
    ])
    expect(created.barcodes.map((b) => [b.barcode, b.barcodeType, b.isPrimary])).toEqual([
      [EAN_A, 'EAN13', 'Y'],
    ])
    // 기존 품목: 이름만 바뀌고 규격·BOX는 그대로 (비운 칸은 안 보냄)
    const old = await savedItem('OLD')
    expect(old).toMatchObject({ name: '이름만 바꿈', spec: '옛 규격' })
    expect(old.units.find((u) => u.level === 'BOX')?.convQty.toString()).toBe('6')

    // 같은 파일을 다시 올리면 변경 없음
    expect(await validateItemUploadAction(file)).toMatchObject({
      ok: true,
      data: { summary: expect.stringContaining('신규 0 · 수정 0 · 변경 없음 2') },
    })
  })

  it('단위별 바코드 칸은 그 단위의 대표 바코드: 이미 있으면 대표로, 없으면 더한다', async () => {
    await create('OLD', {
      units: [unitRow('BASE', ea, '1'), unitRow('BOX', box, '24')],
      barcodes: [barcodeRow(ea, EAN_A, { isPrimary: true })],
    })
    expect(
      await commitItemUploadAction(
        upload({ code: 'OLD', baseBarcode: '8801234567886', boxBarcode: 'BOX-OLD' }),
      ),
    ).toMatchObject({ ok: true })
    expect(
      (await savedItem('OLD')).barcodes.map((b) => [b.barcode, b.unitId, b.isPrimary]),
    ).toEqual([
      [EAN_A, ea, 'N'],
      ['8801234567886', ea, 'Y'],
      ['BOX-OLD', box, 'Y'],
    ])
  })

  it('형식 오류(없는 단위·Y/N·숫자·화주사·같은 품목 두 줄)는 칸에, 업무 오류는 행에 — 하나라도 있으면 전체 등록 안 함', async () => {
    const file = upload(
      NEW_ROW,
      { code: 'BAD1', name: '단위', baseUnit: 'XYZ' },
      { code: 'BAD2', name: '예아니오', baseUnit: 'EA', hazmat: '모름', palletTi: '1.5' },
      { shipperCode: 'NOPE', code: 'BAD3' },
      { code: 'new-1', name: '중복' },
      // 업무 오류: BOX 없는데 BOX 바코드
      { code: 'BAD4', name: 'BOX 없음', baseUnit: 'EA', boxBarcode: 'X-1' },
      // 입력 규칙 오류: 새 품목인데 품목명 없음
      { code: 'BAD5', baseUnit: 'EA' },
    )
    const preview = await validateItemUploadAction(file)
    expect(preview.ok).toBe(true)
    const errors = preview.ok ? preview.data.rows.map((r) => [r.rowNo, r.errors]) : []
    expect(errors).toEqual([
      [2, []],
      [3, [expect.stringContaining('없는 단위 코드')]],
      // 오류는 양식 칸 순서대로 (TI가 위험물보다 앞)
      [4, [expect.stringContaining('정수'), expect.stringContaining('Y / N')]],
      [5, [expect.stringContaining('화주사')]],
      [6, [expect.stringContaining('이미 있습니다')]],
      [7, [expect.stringContaining('BOX 단위가 없습니다')]],
      [8, [expect.stringContaining('품목명')]],
    ])
    expect(await commitItemUploadAction(file)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(await prisma.item.count()).toBe(0)
  })

  it('조회 키 (0084): 품목코드를 비우면 자동 생성, CUST_CD 화주는 사용자정의코드로 찾는다', async () => {
    const { codePrefix } = await prisma.shipper.findUniqueOrThrow({ where: { id: gana } })
    // CODE 화주: 품목코드를 비운 줄은 매번 새 품목 (자동 체번)
    expect(
      await commitItemUploadAction(
        upload({ name: '자동 1', baseUnit: 'EA' }, { name: '자동 2', baseUnit: 'EA' }),
      ),
    ).toMatchObject({ ok: true, data: { message: expect.stringContaining('신규 2') } })
    expect((await prisma.item.findMany({ orderBy: { code: 'asc' } })).map((i) => i.code)).toEqual([
      `${codePrefix}S000001`,
      `${codePrefix}S000002`,
    ])

    // CUST_CD 화주: 사용자정의코드가 키 — 없으면 칸 오류, 있으면 그 품목을 고친다
    await prisma.shipper.update({ where: { id: gana }, data: { ifKeyType: 'CUST_CD' } })
    const noKey = await validateItemUploadAction(
      upload({ code: 'X1', name: '키 없음', baseUnit: 'EA' }),
    )
    expect(noKey.ok && noKey.data.rows[0].errors).toEqual([
      expect.stringContaining('사용자정의코드'),
    ])
    await commitItemUploadAction(upload({ custCode: 'ERP-1', name: '화주 품목', baseUnit: 'EA' }))
    expect(
      await commitItemUploadAction(upload({ custCode: 'ERP-1', name: '이름 바꿈' })),
    ).toMatchObject({ ok: true, data: { message: expect.stringContaining('수정 1') } })
    expect(await prisma.item.findFirstOrThrow({ where: { custCode: 'ERP-1' } })).toMatchObject({
      code: `${codePrefix}S000003`,
      name: '이름 바꿈',
    })
  })

  it('상태 칸: 단종으로 등록, 업로드는 등록·수정 권한 둘 다 필요', async () => {
    expect(await commitItemUploadAction(upload({ ...NEW_ROW, status: '단종' }))).toMatchObject({
      ok: true,
    })
    expect((await savedItem('NEW-1')).status).toBe('DISCONTINUED')

    signIn(ALL_PERMISSION_CODES.filter((c) => c !== 'master.items.update'))
    expect(await validateItemUploadAction(upload(NEW_ROW))).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
