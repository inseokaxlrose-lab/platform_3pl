import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { runInContext } from '@/lib/actor'
import { countCodeUsage } from '@/lib/common-code/code-usage'
import { getItemFormOptions } from '@/lib/items/item-queries'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { loadDataScope } from '@/lib/scope/load-data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { getEffectiveSetting } from '@/lib/settings/effective-setting'
import type { ShipperInput } from '@/lib/shippers/shipper-schema'
import { assertDedicatedShipper } from '@/lib/shippers/dedicated-shipper'
import { receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import {
  createTestCenter,
  createTestCodeGroup,
  createTestShipper,
  createTestUser,
  systemUnit,
  versionOf,
} from '@/test/factories'
import { createInboundFixture } from '@/test/inbound-fixtures'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  changeShipperStatusAction,
  changeShippersStatusAction,
  createShipperAction,
  listShippersAction,
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
  'master.items.read',
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

const center = (centerId: bigint, extra: Partial<ShipperInput['centers'][number]> = {}) => ({
  centerId: String(centerId),
  isDefault: false,
  startOn: '2026-11-01',
  endOn: '',
  status: 'ACTIVE',
  ...extra,
})

// 부를 때마다 다른 코드 접두어 (같은 운영사 안 중복 금지 — AA, AB, …)
const PREFIX_SECOND = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
let prefixSeq = 0
const nextPrefix = () => 'A' + PREFIX_SECOND[prefixSeq++ % PREFIX_SECOND.length]

const input = (overrides: Partial<ShipperInput> = {}): ShipperInput => ({
  code: '',
  codePrefix: nextPrefix(),
  custCode: '',
  ifKeyType: 'CODE',
  name: '가나식품',
  nameEn: '',
  shortName: '',
  shipperType: '',
  industry: '',
  businessNumber: '123-45-67891',
  bizEntity: 'CORP',
  corpRegNo: '',
  subBizNo: '',
  taxType: 'GENERAL',
  ceoName: '',
  businessType: '',
  businessItem: '',
  sortOrder: 0,
  remark: '',
  phone: '02-123-4567',
  fax: '',
  email: '',
  homepageUrl: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  addressJibun: '',
  contractStartOn: '2026-11-01',
  contractEndOn: '',
  autoRenew: true,
  settleCycle: 'MONTHLY',
  closingDay: null,
  paymentTermsDays: null,
  taxInvoiceEmail: '',
  useLot: null,
  useExpiry: null,
  useSerial: null,
  allocRule: null,
  shipCutoffTime: '',
  minInboundShelfDays: null,
  minOutboundShelfDays: null,
  partialShip: true,
  shortagePolicy: 'HOLD',
  labelUnit: 'PLT',
  shipToCenterPolicy: 'AUTO_HOLD',
  autoCreateShipTo: true,
  autoCreateItem: false,
  orderNoScope: 'CLIENT',
  ifMethod: 'PORTAL',
  apiEnabled: false,
  centers: [center(icnId)],
  contacts: [
    {
      duty: 'INBOUND',
      name: '김입고',
      phone: '010-1111-2222',
      email: '',
      isPrimary: true,
      isIfContact: false,
    },
  ],
  ...overrides,
})

async function create(overrides: Partial<ShipperInput> = {}) {
  const result = await createShipperAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const asOperator = <T>(fn: () => Promise<T>) =>
  runInContext({ actor: 'test', operatorId: TEST_OPERATOR_ID }, fn)

beforeEach(async () => {
  await resetDatabase()
  icnId = (await createTestCenter('ICN')).id
  gmhId = (await createTestCenter('GMH')).id
  await createTestCodeGroup('CONTACT_ROLE', [{ code: 'INBOUND' }, { code: 'IT' }])
  await createTestCodeGroup('SETTLE_CYCLE', [{ code: 'MONTHLY' }, { code: 'WEEKLY' }])
  await createTestCodeGroup('SHIPPER_TYPE', [{ code: 'ECOMMERCE' }, { code: 'BRAND' }])
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('화주사 코드 3층 (0084)', () => {
  it('코드 접두어·사용자 정의 코드는 같은 운영사 안에서 중복 금지', async () => {
    await create({ code: 'GANA', codePrefix: 'GN', custCode: 'ERP-1' })
    expect(await createShipperAction(input({ code: 'DARA', codePrefix: 'GN' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('코드 접두어') },
    })
    expect(await createShipperAction(input({ code: 'DARA', custCode: 'ERP-1' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('사용자 정의 코드') },
    })
    // 헷갈리는 글자(I·O·0·1)는 접두어로 쓸 수 없다
    expect(await createShipperAction(input({ code: 'DARA', codePrefix: 'IO' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
  })

  it('화주사 코드는 바꿀 수 없고, 거래처·품목 코드가 발행되면 접두어도 잠긴다', async () => {
    const shipper = await create({ code: 'GANA', codePrefix: 'GN' })
    const update = async (overrides: Partial<ShipperInput>) =>
      updateShipperAction({
        id: shipper.id,
        rowVersion: await versionOf('shipper', shipper.id),
        ...input({ code: 'GANA', codePrefix: 'GN', ...overrides }),
      })
    expect(await update({ code: 'GANA2' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    // 아직 하위 코드가 없으면 접두어를 바꿀 수 있다
    expect(await update({ codePrefix: 'GA' })).toMatchObject({ ok: true })
    // 품목 하나가 생기면 (지워져도) 접두어를 바꿀 수 없다
    await prisma.item.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        shipperId: BigInt(shipper.id),
        code: 'SKU-1',
        name: '품목',
        baseUnitId: (await systemUnit('EA')).id,
      },
    })
    expect(await update({ codePrefix: 'GB' })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('접두어') },
    })
  })
})

describe('화주사 등록·수정 (0080)', () => {
  it('새 화주는 준비중, 운영 설정은 운영사 값 따름(NULL), 하나뿐인 이용 센터는 자동 기본', async () => {
    const shipper = await create({ shipperType: 'ECOMMERCE' })
    // 코드를 비우면 자동 체번 SH + 4자리 (0084)
    expect(shipper.code).toBe('SH0001')
    expect((await create()).code).toBe('SH0002')
    const saved = await prisma.shipper.findUniqueOrThrow({
      where: { id: BigInt(shipper.id) },
      include: { centers: true, contacts: true },
    })
    expect(saved).toMatchObject({
      status: 'PREPARING',
      businessNumber: '1234567891',
      phone: '021234567',
      useLot: null,
      useExpiry: null,
      allocRule: null,
      autoRenewYn: 'Y',
      shipToCenterPolicy: 'AUTO_HOLD',
      apiEnabledYn: 'N',
    })
    expect(saved.centers).toEqual([
      expect.objectContaining({ centerId: icnId, isDefault: 'Y', status: 'ACTIVE' }),
    ])
    expect(saved.contacts).toEqual([
      expect.objectContaining({ duty: 'INBOUND', isPrimary: 'Y', isIfContact: 'N' }),
    ])
    // 공통코드 사용처: 화주 유형이 쓰이고 있으면 지울 수 없다
    expect(await asOperator(() => countCodeUsage(prisma, 'SHIPPER_TYPE', 'ECOMMERCE'))).toBe(1)
  })

  it('입력 규칙: 사업자번호 필수, 이용 센터 1곳 이상·기본 1곳, 연동 담당은 1명·이메일 필수', async () => {
    expect(await createShipperAction(input({ centers: [], businessNumber: '' }))).toMatchObject({
      ok: false,
      error: {
        fieldErrors: {
          centers: [expect.stringContaining('1곳 이상')],
          businessNumber: [expect.stringContaining('입력')],
        },
      },
    })
    // 센터가 둘이면 기본을 정해야 한다
    expect(
      await createShipperAction(input({ centers: [center(icnId), center(gmhId)] })),
    ).toMatchObject({
      ok: false,
      error: { fieldErrors: { centers: [expect.stringContaining('기본')] } },
    })
    const ifContact = {
      duty: 'IT',
      name: '박연동',
      phone: '010-2222-3333',
      email: '',
      isPrimary: true,
      isIfContact: true,
    }
    expect(await createShipperAction(input({ contacts: [ifContact] }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { 'contacts.0.email': [expect.stringContaining('이메일')] } },
    })
    // 개인 사업자면 법인등록번호는 비운다, 계약종료일은 시작일 뒤
    expect(
      await createShipperAction(
        input({ contractStartOn: '2026-11-10', contractEndOn: '2026-11-01' }),
      ),
    ).toMatchObject({ ok: false, error: { fieldErrors: { contractEndOn: [expect.any(String)] } } })
  })

  it('같은 사업자번호는 막지 않고 알려 준다, 요금제 화주 수 한도', async () => {
    await create({ code: 'GANA' })
    expect(await createShipperAction(input({ code: 'GANA2' }))).toMatchObject({
      ok: true,
      data: { notice: expect.stringContaining('GANA') },
    })
    await prisma.operator.update({ where: { id: TEST_OPERATOR_ID }, data: { maxClientCount: 2 } })
    expect(await createShipperAction(input({ code: 'GANA3' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('최대 2곳') },
    })
  })

  it('코드 중복·시스템 코드 모양 거부, 일시중지 센터는 새로 붙일 수 없다', async () => {
    await create({ code: 'GANA' })
    expect(await createShipperAction(input({ code: 'gana' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await createShipperAction(input({ code: 'SH0999' }))).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('자동 체번 모양') },
    })
    await prisma.center.update({
      where: { id: gmhId },
      data: { status: 'SUSPENDED', statusReason: '점검' },
    })
    expect(
      await createShipperAction(input({ code: 'NEW', centers: [center(gmhId)] })),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('수정: 운영 설정·이용 센터·담당자를 바꾼다 (이미 연결된 일시중지 센터는 그대로 둘 수 있다)', async () => {
    const shipper = await create({
      code: 'GANA',
      centers: [center(icnId, { isDefault: true }), center(gmhId)],
    })
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
        centers: [center(gmhId, { isDefault: true })],
        contacts: [],
        useLot: true,
        allocRule: 'FEFO',
        shipCutoffTime: '15:30',
      }),
    })
    expect(result).toMatchObject({ ok: true })
    const saved = await prisma.shipper.findUniqueOrThrow({
      where: { id: BigInt(shipper.id) },
      include: { centers: true, contacts: true },
    })
    expect(saved).toMatchObject({ name: '가나푸드', useLot: 'Y', allocRule: 'FEFO' })
    expect(saved.centers.map((c) => c.centerId)).toEqual([gmhId])
    expect(saved.contacts).toEqual([])
    // 수정 화면 값: 상속 칸은 null, 시각은 HH:MM
    const edit = await getShipperForEdit(BigInt(shipper.id), {
      kind: 'ALL',
      operatorId: TEST_OPERATOR_ID,
    })
    expect(edit?.input).toMatchObject({ useLot: true, useExpiry: null, shipCutoffTime: '15:30' })
  })
})

describe('상태 (0080)', () => {
  it('일시정지는 사유 필수, 해지는 재고·끝나지 않은 입고가 있으면 막는다', async () => {
    // 입고 견본(센터·화주·품목)을 쓰므로 처음부터 다시
    await resetDatabase()
    const ids = await createInboundFixture()
    const change = async (status: string, reason = '') =>
      changeShipperStatusAction({
        id: String(ids.gana),
        rowVersion: await versionOf('shipper', ids.gana),
        status,
        reason,
      })
    expect(await change('SUSPENDED')).toMatchObject({
      ok: false,
      error: { fieldErrors: { reason: [expect.any(String)] } },
    })
    expect(await change('SUSPENDED', '미수금')).toMatchObject({
      ok: true,
      data: { status: 'SUSPENDED' },
    })
    // 재고가 있으면 해지 불가
    await asOperator(() =>
      stockTransaction((tx) =>
        receiveStock(tx, { address: { locationId: ids.icnStaging, itemId: ids.water }, qty: '5' }),
      ),
    )
    expect(await change('TERMINATED', '계약 종료')).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('재고') },
    })
    // 재고 없는 화주는 해지된다 → 수정 불가
    expect(
      await changeShipperStatusAction({
        id: String(ids.dara),
        rowVersion: await versionOf('shipper', ids.dara),
        status: 'TERMINATED',
        reason: '계약 종료',
      }),
    ).toMatchObject({ ok: true })
    const dara = await prisma.shipper.findUniqueOrThrow({ where: { id: ids.dara } })
    expect(dara).toMatchObject({ status: 'TERMINATED', statusReason: '계약 종료' })
  })

  it('일괄 운영중·일시정지 (해지된 화주는 건너뜀), 해지 화주 사용자는 데이터 범위에서 빠진다', async () => {
    const a = await createTestShipper('A1')
    const b = await createTestShipper('B1')
    await prisma.shipper.update({
      where: { id: b.id },
      data: { status: 'TERMINATED', statusReason: '종료' },
    })
    expect(
      await changeShippersStatusAction({
        ids: [String(a.id), String(b.id)],
        status: 'SUSPENDED',
        reason: '점검',
      }),
    ).toEqual({ ok: true, data: { count: 1 } })
    expect(
      await changeShippersStatusAction({ ids: [String(a.id)], status: 'SUSPENDED', reason: '' }),
    ).toMatchObject({ ok: false })

    // 일시정지 화주 사용자: 범위 있음(조회만), 해지 화주 사용자: 범위 없음
    const suspendedUser = await createTestUser('su', { userType: 'SHIPPER', shipperId: a.id })
    const terminatedUser = await createTestUser('tu', { userType: 'SHIPPER', shipperId: b.id })
    expect(await loadDataScope(suspendedUser.id)).toMatchObject({
      kind: 'SHIPPER',
      shipperId: a.id,
    })
    expect((await loadDataScope(terminatedUser.id)).kind).not.toBe('SHIPPER')
  })

  it('품목은 준비중·운영중 화주사만 고를 수 있다 (일시정지는 빠진다)', async () => {
    const preparing = await create({ code: 'PREP' })
    const suspended = await createTestShipper('SUSP', { isActive: false })
    const options = await getItemFormOptions({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
    const codes = options.shippers.map((s) => s.code)
    expect(codes).toContain('PREP')
    expect(codes).not.toContain('SUSP')
    void preparing
    void suspended
  })
})

describe('상속 · 품목 기본값 (0080)', () => {
  it('화주×센터 > 화주 > 센터 > 운영사, 품목 기본값은 화주 → 운영사', async () => {
    const shipper = await create({
      code: 'GANA',
      centers: [center(icnId, { isDefault: true }), center(gmhId)],
    })
    const shipperId = BigInt(shipper.id)
    await prisma.operator.update({
      where: { id: TEST_OPERATOR_ID },
      data: { allocRule: 'FIFO', useLot: 'Y' },
    })
    await prisma.center.update({ where: { id: icnId }, data: { allocRule: 'LIFO' } })
    const alloc = (centerId: bigint) =>
      asOperator(() => getEffectiveSetting('allocRule', { centerId, shipperId }))
    // 화주가 비우면 센터 값
    expect(await alloc(icnId)).toEqual({ value: 'LIFO', source: 'CENTER' })
    // 화주가 정하면 센터보다 화주
    await prisma.shipper.update({ where: { id: shipperId }, data: { allocRule: 'FEFO' } })
    expect(await alloc(icnId)).toEqual({ value: 'FEFO', source: 'SHIPPER' })
    // 화주×센터가 정하면 그 센터만
    await prisma.shipperCenter.update({
      where: { shipperId_centerId: { shipperId, centerId: gmhId } },
      data: { allocRule: 'LIFO' },
    })
    expect(await alloc(gmhId)).toEqual({ value: 'LIFO', source: 'SHIPPER_CENTER' })
    expect(await alloc(icnId)).toEqual({ value: 'FEFO', source: 'SHIPPER' })

    // 품목 기본값: 화주 로트가 비어 있으면 운영사 값(Y)
    const options = await getItemFormOptions({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
    expect(options.shippers.find((s) => s.code === 'GANA')).toMatchObject({ useLot: true })
    await prisma.shipper.update({ where: { id: shipperId }, data: { useLot: 'N' } })
    const after = await getItemFormOptions({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
    expect(after.shippers.find((s) => s.code === 'GANA')).toMatchObject({ useLot: false })
  })

  it('전용 화주사: 그 센터를 이용 중인 화주사만', async () => {
    const shipper = await create({ code: 'GANA' })
    const shipperId = BigInt(shipper.id)
    await expect(
      asOperator(() => assertDedicatedShipper(prisma, shipperId, icnId)),
    ).resolves.toBeUndefined()
    await expect(
      asOperator(() => assertDedicatedShipper(prisma, shipperId, gmhId)),
    ).rejects.toThrow('이 센터를 이용하지 않아')
  })
})

describe('목록 · 데이터 범위', () => {
  it('상태·이용 센터·화주 유형·API 사용으로 거른다, 기본 센터는 ★', async () => {
    await create({ code: 'GANA', shipperType: 'ECOMMERCE' })
    await create({
      code: 'DARA',
      name: '다라전자',
      shipperType: 'BRAND',
      apiEnabled: true,
      centers: [center(icnId), center(gmhId, { isDefault: true })],
    })
    const codes = async (filters: Record<string, string>) => {
      const r = await listShippersAction({ ...createDataGridState(), filters })
      return r.ok ? r.data.rows.map((s) => s.code).sort() : r.error
    }
    expect(await codes({ center: String(gmhId) })).toEqual(['DARA'])
    expect(await codes({ shipperType: 'ECOMMERCE' })).toEqual(['GANA'])
    expect(await codes({ api: 'Y' })).toEqual(['DARA'])
    expect(await codes({ status: 'PREPARING' })).toEqual(['DARA', 'GANA'])
    expect(await codes({ status: 'ACTIVE' })).toEqual([])
    const all = await listShippersAction(createDataGridState())
    expect(all.ok && all.data.rows.find((s) => s.code === 'DARA')?.centers).toBe(
      '★GMH 센터, ICN 센터',
    )
  })

  it('센터 직원: 자기 센터를 이용하는 화주사만 보고, 등록·상태 변경은 못 한다', async () => {
    const gana = await create({ code: 'GANA', centers: [center(icnId)] })
    const dara = await create({ code: 'DARA', centers: [center(gmhId)] })
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [gmhId] })

    const list = await listShippersAction(createDataGridState())
    expect(list.ok && list.data.rows.map((s) => s.code)).toEqual(['DARA'])
    const scope: DataScope = { kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [gmhId] }
    expect(await getShipperForEdit(BigInt(gana.id), scope)).toBeNull()
    expect(await getShipperForEdit(BigInt(dara.id), scope)).not.toBeNull()

    expect(await createShipperAction(input({ code: 'NEW' }))).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(
      await changeShippersStatusAction({ ids: [dara.id], status: 'SUSPENDED', reason: '점검' }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('엑셀 전체는 엑셀 권한 필요', async () => {
    expect(await listShippersAction({ ...createDataGridState(), exportAll: true })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
