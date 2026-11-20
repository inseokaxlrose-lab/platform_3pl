import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { CONTACT_ROLE_GROUP, contactFields } from '@/lib/contacts/contact-schema'
import { deleteExternalCodes } from '@/lib/master-code/external-codes'
import { isAutoPattern, issueCode, issueCodes } from '@/lib/numbering/numbering'
import { prisma, type Db } from '@/lib/prisma'
import { normalizeAddress } from '@/lib/regions/address-normalize'
import type { AddressSearcher } from '@/lib/regions/juso-client'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED } from '@/lib/status'
import { toYn } from '@/lib/yn'
import { isShipperSetupStatus } from '@/lib/shippers/shipper-codes'
import { CUSTOMER_TYPE_GROUP } from './customer-codes'
import type { CustomerCreateData, CustomerData, ShipToData } from './customer-schema'
import { assignShipToCenter, type ShipToCenterPolicy } from './ship-to-center'

// 거래처·납품처 저장 (docs/decisions/0043, 0082). 권한·데이터 범위 검사는 서버 액션에서 한다
// - 화주사·거래처코드·납품처코드는 등록 후 바꿀 수 없다 (거래처코드는 API 업무 키)
// - 담당자는 저장할 때마다 통째로 바꾼다 (거래처의 이력으로 본다)
// - 납품처는 거래처와 함께 저장한다: 기본 1곳(사용 중)·사용 중 1곳 이상, 없으면 거래처 주소로 기본 납품처를 만든다
// - 저장 본체(…In)는 트랜잭션(tx)을 받는다 → API의 TEST 키 dry-run이 같은 로직을 되돌릴 수 있게 (0081)

export type CustomerSaveOptions = {
  // 등록 경로 (화면 SCREEN · 포털 PORTAL · API · 업로드 UPLOAD)
  source?: 'SCREEN' | 'PORTAL' | 'API' | 'UPLOAD'
  // 화주 정책 (포털·API만 — 화면은 늘 "확인 필요로 저장")
  policy?: ShipToCenterPolicy
  requestId?: string
  // 주소 검색기 (테스트에서 가짜를 끼운다)
  searcher?: AddressSearcher
}

// 저장 결과 알림: 확인 필요 납품처 수
const assignNotice = (needConfirm: string[]) =>
  needConfirm.length > 0
    ? `배송센터 확인이 필요한 납품처가 있습니다: ${needConfirm.join(', ')}`
    : undefined

// 거래처코드(직접 입력): 자동 체번 모양 금지({접두어}C000001 — 나중 자동 발급과 겹침), 같은 화주사 안에서 중복 금지
async function assertCustomerCode(db: Db, shipperId: bigint, code: string, prefix: string) {
  if (await isAutoPattern(db, 'CUSTOMER', { operatorId: requireOperatorId(), prefix }, code)) {
    throw new ActionError(
      'VALIDATION',
      `'${code}'는 자동 체번 모양이라 거래처코드로 쓸 수 없습니다. 비워 두면 자동으로 붙습니다.`,
    )
  }
  const owner = await db.customer.findFirst({ where: { shipperId, code }, select: { id: true } })
  if (owner) throw new ActionError('CONFLICT', `이 화주사에 이미 있는 거래처코드입니다: ${code}`)
}

// 사용자 정의 코드: 같은 화주사 안에서 중복 금지 (값이 있을 때, 0084)
async function assertCustomerCustCode(
  db: Db,
  shipperId: bigint,
  custCode: string | null,
  exceptId?: bigint,
) {
  if (!custCode) return
  const owner = await db.customer.findFirst({
    where: { shipperId, custCode },
    select: { id: true, code: true },
  })
  if (owner && owner.id !== exceptId) {
    throw new ActionError(
      'CONFLICT',
      `이 화주사의 다른 거래처(${owner.code})가 쓰는 사용자 정의 코드입니다: ${custCode}`,
    )
  }
}

// 화주사의 코드 접두어 (거래처·품목 자동 체번)
export async function shipperPrefixOf(db: Db, shipperId: bigint) {
  const shipper = await db.shipper.findUnique({
    where: { id: shipperId },
    select: { codePrefix: true },
  })
  if (!shipper) throw new ActionError('NOT_FOUND', '화주사를 찾을 수 없습니다.')
  return shipper.codePrefix
}

async function assertCodes(
  db: Db,
  data: CustomerData,
  keep?: { type: string | null; duties: string[] },
) {
  await assertCodeValues(db, CUSTOMER_TYPE_GROUP, data.customerType ? [data.customerType] : [], {
    label: '거래처 유형',
    keep: keep?.type ? [keep.type] : [],
  })
  await assertCodeValues(
    db,
    CONTACT_ROLE_GROUP,
    data.contacts.map((c) => c.duty),
    { label: '담당 업무', keep: keep?.duties ?? [] },
  )
}

// 거래처 주소 정제 (바뀌었을 때만): 원본은 그대로 두고 등급·지번·법정동·시군구·건물관리번호·정제 방법을 채운다
// (납품처와 같은 정제 결과 칸 묶음, 0084 ④-3)
async function customerAddressFields(
  db: Db,
  data: CustomerData,
  previous: { rawAddress: string | null; rawZipCode: string | null } | null,
  searcher?: AddressSearcher,
) {
  const raw = { rawZipCode: data.zipCode, rawAddress: data.address }
  if (!data.address) {
    return {
      ...raw,
      addressGrade: null,
      addressNormAt: null,
      addressNormMethod: null,
      sigunguName: null,
      bdMgtSn: null,
      addressJibun: data.addressJibun,
      regionCode: data.regionCode,
    }
  }
  if (previous && previous.rawAddress === data.address && previous.rawZipCode === data.zipCode)
    return raw
  const norm = await normalizeAddress(
    db,
    { address: data.address, zipCode: data.zipCode },
    { searcher },
  )
  const sigungu = norm.sigunguCode
    ? await db.regionBjd.findFirst({
        where: { sigunguCode: norm.sigunguCode },
        select: { sigunguName: true },
      })
    : null
  return {
    ...raw,
    addressGrade: norm.grade,
    addressNormAt: new Date(),
    addressNormMethod: norm.method,
    sigunguName: sigungu?.sigunguName ?? null,
    bdMgtSn: norm.bdMgtSn,
    addressJibun: norm.jibunAddress?.slice(0, 200) ?? data.addressJibun,
    regionCode: norm.bjdCode ?? data.regionCode,
  }
}

// DB 칸으로 옮길 값 (담당자·납품처·코드 제외)
function fieldsOf(data: CustomerData) {
  const { contacts, shipTos, addressJibun, regionCode, ...fields } = data
  void contacts
  void shipTos
  void addressJibun
  void regionCode
  return fields
}

const contactRows = (customerId: bigint, contacts: CustomerData['contacts']) =>
  contacts.map((contact, index) => ({
    ...contactFields(contact),
    customerId,
    sortOrder: index,
  }))

type CustomerRef = {
  id: bigint
  shipperId: bigint
  code: string
  name: string
  address: string | null
  zipCode: string | null
  addressDetail: string | null
}

const EXISTING_SHIP_TO_SELECT = {
  id: true,
  code: true,
  custCode: true,
  name: true,
  isDefault: true,
  addrSyncYn: true,
  status: true,
  sortOrder: true,
  receiverName: true,
  receiverPhone: true,
  receiverPhone2: true,
  deliveryMemo: true,
  remark: true,
  rawZipCode: true,
  rawAddress: true,
  addressDetail: true,
  deliveryCenterId: true,
  deliveryCenter: { select: { code: true } },
  centerAssignType: true,
  centerAssignStatus: true,
} as const

type ExistingShipTo = {
  id: bigint
  code: string
  custCode: string | null
  name: string
  isDefault: string
  addrSyncYn: string
  status: string
  sortOrder: number
  receiverName: string | null
  receiverPhone: string | null
  receiverPhone2: string | null
  deliveryMemo: string | null
  remark: string | null
  rawZipCode: string | null
  rawAddress: string
  addressDetail: string | null
  deliveryCenterId: bigint | null
  deliveryCenter: { code: string } | null
  centerAssignType: string | null
  centerAssignStatus: string
}

// 납품처 한 곳의 저장 결과 (API 건별 결과의 shipTos — 0082 ③)
export type ShipToSaveResult = {
  code: string
  // 사용자 정의 코드 (연동 조회 키가 CUST_CD면 보낸 납품처와 이것으로 짝짓는다)
  custCode?: string | null
  result: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'FAIL'
  // FAIL: 화주 정책으로 반려 (CENTER_REQUIRED·INVALID_CENTER_CD·NOT_SHIPPER_CENTER·…)
  error?: { code: string; message: string }
  addressGrade?: string
  zipCode?: string | null
  centerCode?: string | null
  centerAssignType?: string | null
  centerAssignStatus?: string
  centerConfirmReason?: string | null
  regionMismatch?: boolean
}

// 기존 납품처를 그대로 둘지 (주소·센터 선택이 그대로이고 이미 지정됐으면 다시 계산하지 않는다 — 연동 IF 지정 보존)
function keepsAssignment(
  row: ShipToData,
  existing: ExistingShipTo,
  raw: { zip: string | null; address: string; detail: string | null },
) {
  if (existing.centerAssignStatus !== 'ASSIGNED') return false
  if (existing.rawAddress !== raw.address || (existing.rawZipCode ?? null) !== raw.zip) return false
  if ((existing.addressDetail ?? null) !== raw.detail) return false
  if (row.centerMode === 'AUTO') return existing.centerAssignType === 'AUTO'
  if (row.centerMode === 'IF') {
    return (
      existing.centerAssignType === 'IF' &&
      existing.deliveryCenter?.code.toUpperCase() === row.centerCode?.toUpperCase()
    )
  }
  const wasManual = existing.centerAssignType === 'MANUAL' || existing.centerAssignType === 'IF'
  return wasManual && existing.deliveryCenterId === row.deliveryCenterId
}

export type SyncOptions = CustomerSaveOptions & {
  // true(연동·업로드): 목록에 없는 기존 납품처를 지우지 않는다 (보낸 납품처만 고침)
  partial?: boolean
  // true(연동): 화주 정책으로 반려된 납품처는 저장하지 않고 결과에 FAIL로 남긴다 (거래처는 저장)
  // false(화면): 반려되면 저장 전체를 막는다
  collectRejects?: boolean
}

// 납품처 맞추기: 보낸 목록대로 고치고·만들고, 목록에서 빠진 납품처는 지운다(논리 삭제, partial이면 두고)
// 바뀐 것이 없는 납품처는 쓰지 않는다 (수정일·버전 그대로 — API의 UNCHANGED)
async function syncShipTos(
  db: Db,
  customer: CustomerRef,
  rows: ShipToData[],
  options: SyncOptions,
) {
  const existing: ExistingShipTo[] = await db.shipTo.findMany({
    where: { customerId: customer.id },
    select: EXISTING_SHIP_TO_SELECT,
  })
  const byId = new Map(existing.map((s) => [s.id, s]))
  const operatorId = requireOperatorId()
  // 새 납품처: 직접 넣은 코드는 자동 체번 모양({거래처코드}-01) 금지, 비운 코드는 한 번에 체번 (0084)
  for (const row of rows) {
    if (row.id !== null || !row.code) continue
    if (await isAutoPattern(db, 'SHIP_TO', { operatorId, prefix: customer.code }, row.code)) {
      throw new ActionError(
        'VALIDATION',
        `'${row.code}'는 자동 체번 모양이라 납품처코드로 쓸 수 없습니다. 비워 두면 자동으로 붙습니다.`,
      )
    }
  }
  const blank = rows.filter((r) => r.id === null && !r.code)
  if (blank.length > 0) {
    const codes = await issueCodes(
      db,
      'SHIP_TO',
      { operatorId, customerId: customer.id, prefix: customer.code },
      blank.length,
    )
    blank.forEach((row, i) => (row.code = codes[i]))
  }
  // 사용자 정의 코드: 거래처 안에서 중복 금지 (보낸 것끼리·이미 있는 다른 납품처와)
  const custSeen = new Map<string, string>()
  for (const row of rows) {
    if (!row.custCode) continue
    const other =
      custSeen.get(row.custCode) ??
      existing.find((s) => s.custCode === row.custCode && s.id !== row.id)?.code
    if (other && other !== row.code) {
      throw new ActionError(
        'CONFLICT',
        `다른 납품처(${other})가 쓰는 사용자 정의 코드입니다: ${row.custCode}`,
      )
    }
    custSeen.set(row.custCode, row.code)
  }
  for (const row of rows) {
    if (row.id !== null) {
      const found = byId.get(row.id)
      if (!found) throw new ActionError('NOT_FOUND', `찾을 수 없는 납품처입니다: ${row.code}`)
      if (found.code !== row.code) {
        throw new ActionError('VALIDATION', `납품처코드는 바꿀 수 없습니다: ${found.code}`)
      }
    } else if (existing.some((s) => s.code === row.code)) {
      throw new ActionError('CONFLICT', `이 거래처에 이미 있는 납품처코드입니다: ${row.code}`)
    }
  }
  // 빠진 납품처 지우기 (주문 이력 검사는 출고 작업에서 — findUsedShipToIds)
  if (!options.partial) {
    const keepIds = new Set(rows.flatMap((r) => (r.id !== null ? [r.id] : [])))
    const removed = existing.filter((s) => !keepIds.has(s.id))
    if (removed.length > 0) {
      await db.shipTo.updateMany({
        where: { id: { in: removed.map((s) => s.id) } },
        data: { ...DELETED_ONLY, isDefault: 'N' },
      })
    }
  }
  // 기본 납품처가 바뀌면 옛 기본을 먼저 해제 (기본은 거래처당 하나 — 부분 고유)
  const oldDefault = existing.find((s) => s.isDefault === 'Y')
  const newDefault = rows.find((r) => r.isDefault)
  const defaultMoves = Boolean(oldDefault && newDefault && newDefault.id !== oldDefault.id)
  if (oldDefault && defaultMoves) {
    await db.shipTo.update({ where: { id: oldDefault.id }, data: { isDefault: 'N' } })
  }

  const results: ShipToSaveResult[] = []
  const actor = currentActor()
  for (const [index, row] of rows.entries()) {
    // 주소 동기화: 기본 납품처면 거래처 주소를 쓴다
    const sync = row.isDefault && row.addrSync
    if (sync && !customer.address) {
      throw new ActionError('VALIDATION', '거래처 주소와 동기화하려면 거래처 주소가 필요합니다.')
    }
    const raw = sync
      ? { zip: customer.zipCode, address: customer.address!, detail: customer.addressDetail }
      : { zip: row.zipCode || null, address: row.address, detail: row.addressDetail }
    const found = row.id !== null ? byId.get(row.id)! : null
    // partial이면 순서는 기존 자리 그대로, 새 납품처는 뒤에
    const sortOrder = options.partial ? (found?.sortOrder ?? existing.length + index) : index
    const common = {
      custCode: row.custCode,
      name: row.name,
      isDefault: toYn(row.isDefault),
      addrSyncYn: toYn(sync),
      status: row.status,
      sortOrder,
      receiverName: row.receiverName,
      receiverPhone: row.receiverPhone,
      receiverPhone2: row.receiverPhone2,
      deliveryMemo: row.deliveryMemo,
      remark: row.remark,
    }
    if (found && keepsAssignment(row, found, raw)) {
      const same = (Object.keys(common) as (keyof typeof common)[]).every(
        (key) => (found[key] ?? null) === (common[key] ?? null),
      )
      if (!same) {
        await db.shipTo.update({
          where: { id: found.id },
          data: {
            ...common,
            ...(options.requestId && { lastIfAt: new Date(), lastRequestId: options.requestId }),
          },
        })
      }
      results.push({
        code: row.code,
        custCode: row.custCode,
        result: same ? 'UNCHANGED' : 'UPDATED',
      })
      continue
    }
    const assigned = await assignShipToCenter(db, {
      operatorId,
      shipperId: customer.shipperId,
      rawZipCode: raw.zip,
      rawAddress: raw.address,
      addressDetail: raw.detail,
      centerId: row.centerMode === 'MANUAL' ? row.deliveryCenterId : null,
      centerCode: row.centerMode === 'IF' ? row.centerCode : null,
      inputType: row.centerMode === 'IF' ? 'IF' : 'MANUAL',
      policy: options.policy,
      searcher: options.searcher,
      actor,
    })
    if (assigned.rejected) {
      if (!options.collectRejects) {
        throw new ActionError('VALIDATION', `${row.code}: ${assigned.rejected.message}`)
      }
      results.push({
        code: row.code,
        custCode: row.custCode,
        result: 'FAIL',
        error: assigned.rejected,
      })
      continue
    }
    const f = assigned.fields
    const data = {
      ...common,
      ...f,
      ...(options.requestId && { lastIfAt: new Date(), lastRequestId: options.requestId }),
    }
    if (found) {
      await db.shipTo.update({ where: { id: found.id }, data })
    } else {
      await db.shipTo.create({
        data: {
          ...data,
          operatorId,
          shipperId: customer.shipperId,
          customerId: customer.id,
          code: row.code,
          source: options.source ?? 'SCREEN',
        },
      })
    }
    results.push({
      code: row.code,
      custCode: row.custCode,
      result: found ? 'UPDATED' : 'CREATED',
      addressGrade: f.addressGrade,
      zipCode: f.zipCode,
      centerCode: assigned.centerCode,
      centerAssignType: f.centerAssignType,
      centerAssignStatus: f.centerAssignStatus,
      centerConfirmReason: f.centerConfirmReason,
      regionMismatch: f.regionMismatchYn === 'Y',
    })
  }
  // 새 기본 납품처가 반려됐으면 옛 기본으로 되돌린다 (기본은 꼭 1곳)
  if (
    oldDefault &&
    defaultMoves &&
    results.find((r) => r.code === newDefault!.code)?.result === 'FAIL'
  ) {
    await db.shipTo.update({ where: { id: oldDefault.id }, data: { isDefault: 'Y' } })
  }
  return results
}

// 확인 필요로 남은 납품처 코드 (화면 저장 알림)
const needConfirmCodes = (results: ShipToSaveResult[]) =>
  results.filter((r) => r.centerAssignStatus === 'NEED_CONFIRM').map((r) => r.code)

// 거래처 주소로 만드는 기본 납품처 (납품처 없이 등록할 때)
const defaultShipToRow = (customer: CustomerRef): ShipToData => ({
  id: null,
  // 비워 두면 자동 체번 {거래처코드}-01 (0084)
  code: '',
  custCode: null,
  name: customer.name,
  isDefault: true,
  addrSync: true,
  status: 'ACTIVE',
  zipCode: customer.zipCode ?? '',
  address: customer.address ?? '',
  addressDetail: customer.addressDetail,
  regionCode: null,
  receiverName: null,
  receiverPhone: null,
  receiverPhone2: null,
  deliveryMemo: null,
  centerMode: 'AUTO',
  deliveryCenterId: null,
  remark: null,
})

// 등록 본체 (트랜잭션 안): 화주사 상태 → 코드 → 거래처 → 담당자 → 납품처(없으면 기본 납품처 자동)
export async function createCustomerIn(
  db: Db,
  data: CustomerCreateData,
  options: SyncOptions = {},
) {
  const shipper = await db.shipper.findUnique({
    where: { id: data.shipperId },
    select: { status: true },
  })
  if (!shipper) throw new ActionError('NOT_FOUND', '화주사를 찾을 수 없습니다.')
  if (!isShipperSetupStatus(shipper.status)) {
    throw new ActionError('CONFLICT', '준비중·운영중인 화주사에만 거래처를 등록할 수 있습니다.')
  }
  const prefix = await shipperPrefixOf(db, data.shipperId)
  if (data.code) await assertCustomerCode(db, data.shipperId, data.code, prefix)
  await assertCustomerCustCode(db, data.shipperId, data.custCode)
  await assertCodes(db, data)
  const { shipperId, ...rest } = data
  // 거래처코드: 비우면 자동 체번 {화주 접두어}C000001
  const code =
    data.code ||
    (await issueCode(db, 'CUSTOMER', { operatorId: requireOperatorId(), shipperId, prefix }))
  const customer = await db.customer.create({
    data: {
      ...fieldsOf(rest),
      ...(await customerAddressFields(db, rest, null, options.searcher)),
      operatorId: requireOperatorId(),
      shipperId,
      code,
      source: options.source ?? 'SCREEN',
      ...(options.requestId && { lastIfAt: new Date(), lastRequestId: options.requestId }),
    },
    select: {
      id: true,
      code: true,
      rowVersion: true,
      shipperId: true,
      name: true,
      address: true,
      zipCode: true,
      addressDetail: true,
    },
  })
  await db.customerContact.createMany({ data: contactRows(customer.id, data.contacts) })
  const rows = data.shipTos.length > 0 ? data.shipTos : [defaultShipToRow(customer)]
  // 납품처를 함께 보냈으면 그중 기본 표시, 기본 납품처를 자동으로 만들면 시스템 생성
  const shipTos = await syncShipTos(db, customer, rows, options)
  if (data.shipTos.length === 0) {
    await db.shipTo.updateMany({
      where: { customerId: customer.id, code: shipTos[0].code },
      data: { systemCreatedYn: 'Y' },
    })
  }
  return {
    id: customer.id,
    code: customer.code,
    rowVersion: customer.rowVersion,
    notice: assignNotice(needConfirmCodes(shipTos)),
    shipTos,
  }
}

// 수정 본체 (트랜잭션 안): 화주사·거래처코드는 바뀌지 않는다 (사용자 정의 코드는 바꿀 수 있다)
// rowVersion: 화면이 불러온 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateCustomerIn(
  db: Db,
  id: bigint,
  rowVersion: number,
  data: CustomerData,
  options: SyncOptions = {},
) {
  const found = await db.customer.findUnique({
    where: { id },
    select: {
      rowVersion: true,
      shipperId: true,
      code: true,
      customerType: true,
      rawAddress: true,
      rawZipCode: true,
      contacts: { select: { duty: true } },
    },
  })
  assertRowVersion(found, rowVersion, '거래처를 찾을 수 없습니다.')
  const current = found!
  await assertCustomerCustCode(db, current.shipperId, data.custCode, id)
  if (data.shipTos.length === 0) {
    throw new ActionError('VALIDATION', '사용 중인 납품처가 1곳 이상 있어야 합니다.')
  }
  await assertCodes(db, data, {
    type: current.customerType,
    duties: current.contacts.map((c) => c.duty),
  })
  const addressFields = await customerAddressFields(db, data, current, options.searcher)
  const saved = await withVersionGuard(() =>
    db.customer.update({
      where: { id, rowVersion },
      data: {
        ...fieldsOf(data),
        ...addressFields,
        ...(options.requestId && { lastIfAt: new Date(), lastRequestId: options.requestId }),
      },
      select: {
        id: true,
        code: true,
        rowVersion: true,
        shipperId: true,
        name: true,
        address: true,
        zipCode: true,
        addressDetail: true,
      },
    }),
  )
  await db.customerContact.deleteMany({ where: { customerId: id } })
  await db.customerContact.createMany({ data: contactRows(id, data.contacts) })
  const shipTos = await syncShipTos(db, saved, data.shipTos, options)
  return {
    id,
    code: saved.code,
    rowVersion: saved.rowVersion,
    notice: assignNotice(needConfirmCodes(shipTos)),
    shipTos,
  }
}

export const createCustomer = (data: CustomerCreateData, options?: CustomerSaveOptions) =>
  prisma.$transaction((tx) => createCustomerIn(tx, data, options))

export const updateCustomer = (
  id: bigint,
  rowVersion: number,
  data: CustomerData,
  options?: CustomerSaveOptions,
) => prisma.$transaction((tx) => updateCustomerIn(tx, id, rowVersion, data, options))

// 거래중 / 거래중지 (여러 건): 납품처는 그대로, 신규 출고요청만 막힌다 (출고 작업에서 적용)
export async function setCustomersStatus(ids: bigint[], status: 'ACTIVE' | 'SUSPENDED') {
  const { count } = await prisma.customer.updateMany({
    where: { id: { in: ids } },
    data: { status },
  })
  return { count }
}

// 쓰인 적 있는 거래처 id (출고 기록이 있음)
// TODO(출고 작업, MVP 이후): 출고·배송요청 표가 생기면 여기서 검사한다. 지금은 쓰일 곳이 없어 빈 목록
export async function findUsedCustomerIds(ids: bigint[]): Promise<bigint[]> {
  void ids
  return []
}

// 지우기: 쓰인 적 없는 거래처만, 논리 삭제 (되살릴 수 있다). 납품처도 함께 지우고, 외부 코드는 지운다
export async function deleteCustomers(ids: bigint[]) {
  if ((await findUsedCustomerIds(ids)).length > 0) {
    throw new ActionError('CONFLICT', '출고 기록이 있는 거래처는 지울 수 없습니다. 거래중지하세요.')
  }
  return prisma.$transaction(async (tx) => {
    for (const id of ids) await deleteExternalCodes(tx, 'CUSTOMER', id)
    await tx.shipTo.updateMany({ where: { customerId: { in: ids } }, data: DELETED_ONLY })
    const { count } = await tx.customer.updateMany({
      where: { id: { in: ids } },
      data: DELETED_ONLY,
    })
    return { count }
  })
}

// 되살리기: 같은 화주사에 같은 거래처코드가 이미 다시 생겼으면 거부. 납품처도 함께 되살린다
export async function restoreCustomers(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.customer.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { shipperId: true, code: true },
    })
    assertAllFound(rows.length, ids.length, '거래처')
    const taken = await tx.customer.findMany({
      where: { OR: rows.map((r) => ({ shipperId: r.shipperId, code: r.code })) },
      select: { code: true },
    })
    assertNoCodeConflict(
      taken.map((t) => t.code),
      '거래처코드',
    )
    // 납품처: 거래처와 함께 지운 것을 되살린다. 그 사이 같은 코드가 다시 생긴 납품처는 건너뛴다
    const deletedShipTos = await tx.shipTo.findMany({
      where: { customerId: { in: ids }, ...DELETED_ONLY },
      select: { id: true, customerId: true, code: true },
    })
    const alive = await tx.shipTo.findMany({
      where: { customerId: { in: ids } },
      select: { customerId: true, code: true },
    })
    const takenKey = new Set(alive.map((s) => `${s.customerId}:${s.code}`))
    await tx.shipTo.updateMany({
      where: {
        id: {
          in: deletedShipTos
            .filter((s) => !takenKey.has(`${s.customerId}:${s.code}`))
            .map((s) => s.id),
        },
        ...DELETED_ONLY,
      },
      data: NOT_DELETED,
    })
    const { count } = await tx.customer.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}
