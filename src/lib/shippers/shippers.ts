import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { CONTACT_ROLE_GROUP } from '@/lib/contacts/contact-schema'
import { timeToDate } from '@/lib/format/time'
import { isAutoPattern, issueCode } from '@/lib/numbering/numbering'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { prisma, type Db } from '@/lib/prisma'
import { toYn } from '@/lib/yn'
import { formatBusinessNumber } from '@/lib/format'
import {
  SETTLE_CYCLE_GROUP,
  SHIPPER_INDUSTRY_GROUP,
  SHIPPER_TYPE_GROUP,
  type ShipperData,
} from './shipper-schema'
import { isCenterSetupStatus } from '@/lib/centers/center-status'
import { revokeShipperKeys } from '@/lib/api/api-keys'

// 화주사 저장 (docs/decisions/0035, 0080). 권한·데이터 범위 검사는 서버 액션에서 한다

// 화주사 코드(직접 입력): 자동 체번 모양 금지(SH0001 — 나중 자동 발급과 겹침), 같은 운영사 안에서 중복 금지
async function assertShipperCode(db: Db, code: string) {
  const operatorId = requireOperatorId()
  if (await isAutoPattern(db, 'SHIPPER', { operatorId }, code)) {
    throw new ActionError(
      'VALIDATION',
      `'${code}'는 자동 체번 모양이라 화주사 코드로 쓸 수 없습니다. 비워 두면 자동으로 붙습니다.`,
    )
  }
  const owner = await db.shipper.findFirst({ where: { operatorId, code }, select: { id: true } })
  if (owner) throw new ActionError('CONFLICT', `이미 있는 화주사 코드입니다: ${code}`)
}

// 코드 접두어·사용자 정의 코드: 같은 운영사 안에서 중복 금지 (0084)
async function assertPrefixAndCustCode(
  db: Db,
  data: Pick<ShipperData, 'codePrefix' | 'custCode'>,
  exceptId?: bigint,
) {
  const operatorId = requireOperatorId()
  const prefixOwner = await db.shipper.findFirst({
    where: { operatorId, codePrefix: data.codePrefix },
    select: { id: true, code: true },
  })
  if (prefixOwner && prefixOwner.id !== exceptId) {
    throw new ActionError(
      'CONFLICT',
      `다른 화주사(${prefixOwner.code})가 쓰는 코드 접두어입니다: ${data.codePrefix}`,
    )
  }
  if (!data.custCode) return
  const custOwner = await db.shipper.findFirst({
    where: { operatorId, custCode: data.custCode },
    select: { id: true, code: true },
  })
  if (custOwner && custOwner.id !== exceptId) {
    throw new ActionError(
      'CONFLICT',
      `다른 화주사(${custOwner.code})가 쓰는 사용자 정의 코드입니다: ${data.custCode}`,
    )
  }
}

// 코드 접두어는 거래처·품목 코드가 하나라도 발행되면 바꿀 수 없다 (지운 것 포함 — 이미 그 접두어로 코드가 나갔다)
export async function hasIssuedChildCodes(db: Db, shipperId: bigint) {
  const anyDel = { delYn: { in: ['Y', 'N'] } }
  const [customers, items] = await Promise.all([
    db.customer.count({ where: { shipperId, ...anyDel } }),
    db.item.count({ where: { shipperId, ...anyDel } }),
  ])
  return customers + items > 0
}

// 요금제 한도: 운영사의 최대 화주 수 (비어 있으면 무제한, 해지 화주도 센다)
async function assertShipperLimit(db: Db) {
  const operator = await db.operator.findUniqueOrThrow({
    where: { id: requireOperatorId() },
    select: { maxClientCount: true },
  })
  if (operator.maxClientCount === null) return
  const count = await db.shipper.count({ where: { operatorId: requireOperatorId() } })
  if (count >= operator.maxClientCount) {
    throw new ActionError(
      'CONFLICT',
      `화주사는 최대 ${operator.maxClientCount}곳까지 등록할 수 있습니다. (요금제 한도) 플랫폼 관리자에게 문의하세요.`,
    )
  }
}

// 이용 센터: 모두 있어야 하고, 새로 붙이는 센터는 준비중·운영중이어야 한다 (이미 연결된 센터는 그대로 둘 수 있다)
async function assertCenters(db: Db, centerIds: bigint[], keep: bigint[] = []) {
  const centers = await db.center.findMany({
    where: { id: { in: centerIds } },
    select: { id: true, code: true, status: true },
  })
  if (centers.length !== centerIds.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 센터가 섞여 있습니다.')
  }
  const inactive = centers.filter((c) => !isCenterSetupStatus(c.status) && !keep.includes(c.id))
  if (inactive.length > 0) {
    throw new ActionError(
      'CONFLICT',
      `준비중·운영중이 아닌 센터는 이용 센터로 붙일 수 없습니다: ${inactive.map((c) => c.code).join(', ')}`,
    )
  }
}

// 이용을 끝내거나 빼는 센터: 그 센터에 이 화주사의 재고·끝나지 않은 입고가 있으면 막는다
async function assertCentersRemovable(db: Db, shipperId: bigint, centerIds: bigint[]) {
  if (centerIds.length === 0) return
  const [stocks, asns] = await Promise.all([
    db.stock.findMany({
      where: { shipperId, centerId: { in: centerIds }, qty: { gt: 0 } },
      select: { center: { select: { code: true } } },
      distinct: ['centerId'],
    }),
    db.asn.findMany({
      where: { shipperId, centerId: { in: centerIds }, status: { notIn: ['COMPLETED', 'CLOSED'] } },
      select: { center: { select: { code: true } } },
      distinct: ['centerId'],
    }),
  ])
  const codes = [...new Set([...stocks, ...asns].map((row) => row.center.code))]
  if (codes.length > 0) {
    throw new ActionError(
      'CONFLICT',
      `재고나 끝나지 않은 입고가 있는 센터는 빼거나 이용 종료할 수 없습니다: ${codes.join(', ')}`,
    )
  }
}

// 공통코드 칸 검사 (화주 유형·업종·정산 주기·담당 업무)
async function assertShipperCodes(db: Db, data: ShipperData, keep?: KeepCodes) {
  await assertCodeValues(db, SHIPPER_TYPE_GROUP, data.shipperType ? [data.shipperType] : [], {
    label: '화주 유형',
    keep: keep?.shipperType ? [keep.shipperType] : [],
  })
  await assertCodeValues(db, SHIPPER_INDUSTRY_GROUP, data.industry ? [data.industry] : [], {
    label: '업종',
    keep: keep?.industry ? [keep.industry] : [],
  })
  await assertCodeValues(db, SETTLE_CYCLE_GROUP, [data.settleCycle], {
    label: '정산 주기',
    keep: keep ? [keep.settleCycle] : [],
  })
  await assertCodeValues(
    db,
    CONTACT_ROLE_GROUP,
    data.contacts.map((c) => c.duty),
    { label: '담당 업무', keep: keep?.duties ?? [] },
  )
}
type KeepCodes = {
  shipperType: string | null
  industry: string | null
  settleCycle: string
  duties: string[]
}

// 같은 운영사에 같은 사업자등록번호의 다른 화주가 있으면 알림 (막지 않는다: 같은 회사의 사업부별 화주 가능)
async function businessNumberNotice(db: Db, businessNumber: string, exceptId?: bigint) {
  const others = await db.shipper.findMany({
    where: { businessNumber, ...(exceptId !== undefined && { id: { not: exceptId } }) },
    select: { code: true },
    take: 3,
  })
  return others.length > 0
    ? `같은 사업자등록번호(${formatBusinessNumber(businessNumber)})의 화주사가 있습니다: ${others.map((o) => o.code).join(', ')}`
    : undefined
}

const dateOf = (text: string) => new Date(`${text}T00:00:00.000Z`)
const optionalDateOf = (text: string | null) => (text ? dateOf(text) : null)
const ynOrNull = (value: boolean | null) => (value === null ? null : toYn(value))

// 화주사 본문 칸 (이용 센터·담당자·코드 제외)
function fieldsOf(data: ShipperData) {
  const {
    centers,
    contacts,
    code,
    contractStartOn,
    contractEndOn,
    autoRenew,
    useLot,
    useExpiry,
    useSerial,
    shipCutoffTime,
    partialShip,
    autoCreateShipTo,
    autoCreateItem,
    apiEnabled,
    ...fields
  } = data
  void centers
  void contacts
  void code
  // 예/아니오 칸은 DB에 'Y'/'N', 날짜·시각은 Date로
  return {
    ...fields,
    contractStartOn: dateOf(contractStartOn),
    contractEndOn: optionalDateOf(contractEndOn),
    autoRenewYn: toYn(autoRenew),
    useLot: ynOrNull(useLot),
    useExpiry: ynOrNull(useExpiry),
    useSerial: ynOrNull(useSerial),
    shipCutoffTime: shipCutoffTime ? timeToDate(shipCutoffTime) : null,
    partialShipYn: toYn(partialShip),
    autoCreateShipToYn: toYn(autoCreateShipTo),
    autoCreateItemYn: toYn(autoCreateItem),
    apiEnabledYn: toYn(apiEnabled),
  }
}

const contactRows = (shipperId: bigint, contacts: ShipperData['contacts']) =>
  contacts.map(({ isPrimary, isIfContact, ...contact }, index) => ({
    ...contact,
    isPrimary: toYn(isPrimary),
    isIfContact: toYn(isIfContact),
    shipperId,
    sortOrder: index,
  }))

const centerRows = (shipperId: bigint, centers: ShipperData['centers']) =>
  centers.map((row) => ({
    shipperId,
    centerId: row.centerId,
    isDefault: toYn(row.isDefault),
    startOn: dateOf(row.startOn),
    endOn: optionalDateOf(row.endOn),
    status: row.status,
  }))

// 등록 (한 트랜잭션: 한도 → 코드(비우면 자동 체번) → 화주사 → 이용 센터 → 담당자). 새 화주는 준비중으로 시작
export async function createShipper(data: ShipperData) {
  return prisma.$transaction(async (tx) => {
    await assertShipperLimit(tx)
    // 화주사 코드: 비우면 자동 체번 (SH0001), 직접 넣으면 검사
    if (data.code) await assertShipperCode(tx, data.code)
    await assertPrefixAndCustCode(tx, data)
    const code = data.code || (await issueCode(tx, 'SHIPPER', { operatorId: requireOperatorId() }))
    await assertCenters(
      tx,
      data.centers.map((c) => c.centerId),
    )
    await assertShipperCodes(tx, data)
    const notice = await businessNumberNotice(tx, data.businessNumber)
    const shipper = await tx.shipper.create({
      data: {
        ...fieldsOf(data),
        operatorId: requireOperatorId(),
        code,
        status: 'PREPARING',
      },
      select: { id: true, code: true, rowVersion: true },
    })
    await tx.shipperCenter.createMany({ data: centerRows(shipper.id, data.centers) })
    await tx.shipperContact.createMany({ data: contactRows(shipper.id, data.contacts) })
    return { ...shipper, notice }
  })
}

// 수정: 화주사 코드·상태는 바뀌지 않는다 (상태는 changeShipperStatus). 이용 센터·담당자는 통째로 바꾼다
// rowVersion: 화면이 불러온 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateShipper(id: bigint, rowVersion: number, data: ShipperData) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.shipper.findUnique({
      where: { id },
      select: {
        rowVersion: true,
        code: true,
        codePrefix: true,
        shipperType: true,
        industry: true,
        settleCycle: true,
        centers: { select: { centerId: true, status: true } },
        contacts: { select: { duty: true } },
      },
    })
    assertRowVersion(found, rowVersion, '화주사를 찾을 수 없습니다.')
    const current = found!
    // 화주사 코드는 바꿀 수 없다 (0084). 접두어는 하위 코드가 발행되기 전에만
    if (data.code && data.code !== current.code) {
      throw new ActionError('VALIDATION', `화주사 코드는 바꿀 수 없습니다 (지금 ${current.code}).`)
    }
    if (data.codePrefix !== current.codePrefix && (await hasIssuedChildCodes(tx, id))) {
      throw new ActionError(
        'CONFLICT',
        '이미 거래처·품목 코드가 발행되어 코드 접두어를 바꿀 수 없습니다.',
      )
    }
    await assertPrefixAndCustCode(tx, data, id)
    await assertCenters(
      tx,
      data.centers.map((c) => c.centerId),
      current.centers.map((c) => c.centerId),
    )
    // 빼거나 이용 종료로 바꾸는 센터
    const nextActive = new Set(
      data.centers.filter((c) => c.status === 'ACTIVE').map((c) => c.centerId),
    )
    await assertCentersRemovable(
      tx,
      id,
      current.centers
        .filter((c) => c.status === 'ACTIVE' && !nextActive.has(c.centerId))
        .map((c) => c.centerId),
    )
    await assertShipperCodes(tx, data, {
      shipperType: current.shipperType,
      industry: current.industry,
      settleCycle: current.settleCycle,
      duties: current.contacts.map((c) => c.duty),
    })
    const notice = await businessNumberNotice(tx, data.businessNumber, id)
    const saved = await withVersionGuard(() =>
      tx.shipper.update({
        where: { id, rowVersion },
        data: fieldsOf(data),
        select: { code: true, rowVersion: true },
      }),
    )
    await tx.shipperCenter.deleteMany({ where: { shipperId: id } })
    await tx.shipperCenter.createMany({ data: centerRows(id, data.centers) })
    await tx.shipperContact.deleteMany({ where: { shipperId: id } })
    await tx.shipperContact.createMany({ data: contactRows(id, data.contacts) })
    return { id, code: saved.code, rowVersion: saved.rowVersion, notice }
  })
}

// 해지할 수 없는 이유: 재고가 남았거나 끝나지 않은 입고가 있으면 (주문은 출고 작업에서 더한다)
async function terminateBlockers(db: Db, shipperId: bigint) {
  const [stock, openAsns] = await Promise.all([
    db.stock.count({ where: { shipperId, qty: { gt: 0 } } }),
    db.asn.count({ where: { shipperId, status: { notIn: ['COMPLETED', 'CLOSED'] } } }),
  ])
  return [
    stock > 0 && `재고가 남은 줄 ${stock}개`,
    openAsns > 0 && `끝나지 않은 입고(ASN) ${openAsns}건`,
  ].filter((reason): reason is string => Boolean(reason))
}

async function assertTerminable(db: Db, shipper: { id: bigint; code: string }) {
  const reasons = await terminateBlockers(db, shipper.id)
  if (reasons.length > 0) {
    throw new ActionError(
      'CONFLICT',
      `${shipper.code}는 해지할 수 없습니다: ${reasons.join(', ')}. 정리한 뒤 다시 시도하세요.`,
    )
  }
}

// 상태 변경 (헤더 [상태 변경] 팝업): 일시정지·해지는 사유, 해지는 재고·입고 확인
// 해지하면 API 키를 모두 폐기한다 (0081, 같은 트랜잭션)
export async function changeShipperStatus(
  id: bigint,
  rowVersion: number,
  input: { status: string; reason: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.shipper.findUnique({
      where: { id },
      select: { id: true, code: true, rowVersion: true },
    })
    assertRowVersion(current, rowVersion, '화주사를 찾을 수 없습니다.')
    if (input.status === 'TERMINATED') await assertTerminable(tx, current!)
    const saved = await withVersionGuard(() =>
      tx.shipper.update({
        where: { id, rowVersion },
        data: {
          status: input.status,
          // 준비중·운영중으로 돌아가면 사유는 지운다
          statusReason:
            input.status === 'SUSPENDED' || input.status === 'TERMINATED' ? input.reason : null,
        },
        select: { rowVersion: true, status: true },
      }),
    )
    if (input.status === 'TERMINATED') {
      await revokeShipperKeys(tx, id, `화주 해지: ${input.reason ?? ''}`.slice(0, 200))
    }
    return { id, ...saved }
  })
}

// 여러 화주사를 한꺼번에 운영중·일시정지로 (목록 일괄 처리, 해지는 편집 화면에서만). 해지된 화주는 건너뜀
export async function changeShippersStatus(
  ids: bigint[],
  status: 'ACTIVE' | 'SUSPENDED',
  reason: string | null,
) {
  const { count } = await prisma.shipper.updateMany({
    where: { id: { in: ids }, status: { not: 'TERMINATED' } },
    data: { status, statusReason: status === 'SUSPENDED' ? reason : null },
  })
  return { count }
}
