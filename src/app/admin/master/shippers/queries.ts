import 'server-only'
import { toContactInput } from '@/lib/contacts/contact-schema'
import { dateToTime } from '@/lib/format/time'
import { textIds } from '@/lib/id'
import { hasIssuedChildCodes } from '@/lib/shippers/shippers'
import { prisma } from '@/lib/prisma'
import { isActiveStatus } from '@/lib/status'
import { isCenterSetupStatus } from '@/lib/centers/center-status'
import { isYes } from '@/lib/yn'
import { isInScope, operatorFilter, type DataScope } from '@/lib/scope/data-scope'
import type { ShipperInput } from '@/lib/shippers/shipper-schema'

// 날짜 칸 → 'YYYY-MM-DD' (없으면 빈 글자)
const dayText = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : '')
// 상속 칸 'Y'/'N'/NULL → true/false/null (null = 위 단계 값)
const ynOrNull = (value: string | null) => (value === null ? null : isYes(value))

// 수정 화면용 화주사 한 건 (범위 밖이면 null → "찾을 수 없음")
// 센터 직원은 자기 센터를 이용하는 화주사만
export async function getShipperForEdit(id: bigint, scope: DataScope) {
  const shipper = await prisma.shipper.findUnique({
    where: { id },
    include: {
      centers: { orderBy: { startOn: 'asc' } },
      contacts: { orderBy: { sortOrder: 'asc' } },
      users: {
        select: { id: true, name: true, username: true, displayUsername: true, status: true },
        orderBy: { name: 'asc' },
      },
    },
  })
  if (!shipper || !isInScope(scope, shipper, { center: 'centers.some.centerId', shipper: 'id' })) {
    return null
  }
  const text = (value: string | null) => value ?? ''
  const input: ShipperInput = {
    code: shipper.code,
    codePrefix: shipper.codePrefix,
    custCode: text(shipper.custCode),
    ifKeyType: shipper.ifKeyType as ShipperInput['ifKeyType'],
    name: shipper.name,
    nameEn: text(shipper.nameEn),
    shortName: text(shipper.shortName),
    shipperType: text(shipper.shipperType),
    industry: text(shipper.industry),
    businessNumber: text(shipper.businessNumber),
    bizEntity: shipper.bizEntity,
    corpRegNo: text(shipper.corpRegNo),
    subBizNo: text(shipper.subBizNo),
    taxType: shipper.taxType,
    ceoName: text(shipper.ceoName),
    businessType: text(shipper.businessType),
    businessItem: text(shipper.businessItem),
    sortOrder: shipper.sortOrder,
    remark: text(shipper.remark),
    phone: text(shipper.phone),
    fax: text(shipper.fax),
    email: text(shipper.email),
    homepageUrl: text(shipper.homepageUrl),
    zipCode: text(shipper.zipCode),
    address: text(shipper.address),
    addressDetail: text(shipper.addressDetail),
    addressJibun: text(shipper.addressJibun),
    contractStartOn: dayText(shipper.contractStartOn),
    contractEndOn: dayText(shipper.contractEndOn),
    autoRenew: isYes(shipper.autoRenewYn),
    settleCycle: shipper.settleCycle,
    closingDay: shipper.closingDay,
    paymentTermsDays: shipper.paymentTermsDays,
    taxInvoiceEmail: text(shipper.taxInvoiceEmail),
    useLot: ynOrNull(shipper.useLot),
    useExpiry: ynOrNull(shipper.useExpiry),
    useSerial: ynOrNull(shipper.useSerial),
    allocRule: shipper.allocRule,
    shipCutoffTime: dateToTime(shipper.shipCutoffTime),
    minInboundShelfDays: shipper.minInboundShelfDays,
    minOutboundShelfDays: shipper.minOutboundShelfDays,
    partialShip: isYes(shipper.partialShipYn),
    shortagePolicy: shipper.shortagePolicy,
    labelUnit: shipper.labelUnit,
    shipToCenterPolicy: shipper.shipToCenterPolicy,
    autoCreateShipTo: isYes(shipper.autoCreateShipToYn),
    autoCreateItem: isYes(shipper.autoCreateItemYn),
    orderNoScope: shipper.orderNoScope,
    ifMethod: shipper.ifMethod,
    apiEnabled: isYes(shipper.apiEnabledYn),
    centers: shipper.centers.map((c) => ({
      centerId: String(c.centerId),
      isDefault: isYes(c.isDefault),
      startOn: dayText(c.startOn),
      endOn: dayText(c.endOn),
      status: c.status,
    })),
    contacts: shipper.contacts.map((c) => ({
      ...toContactInput(c),
      isIfContact: isYes(c.isIfContact),
    })),
  }
  // 화면으로 보낼 값이라 키는 글자로
  return textIds({
    id: shipper.id,
    // 동시 수정 막기: 저장할 때 이 버전을 함께 보낸다
    rowVersion: shipper.rowVersion,
    status: shipper.status,
    statusReason: shipper.statusReason,
    // 거래처·품목 코드가 이미 발행되었으면 코드 접두어를 바꿀 수 없다 (0084)
    codePrefixLocked: await hasIssuedChildCodes(prisma, shipper.id),
    updatedAt: shipper.updatedAt,
    updatedBy: shipper.updatedBy,
    input,
    users: shipper.users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.displayUsername ?? u.username ?? '',
      isActive: isActiveStatus(u.status),
    })),
  })
}

export type ShipperForEdit = NonNullable<Awaited<ReturnType<typeof getShipperForEdit>>>

// 이용 센터로 고를 수 있는 센터 (내 운영사의 전체 센터 — 준비중·운영중이 아닌 센터는 이미 연결된 경우에만 보인다)
export async function getCenterChoices(scope: DataScope) {
  const centers = await prisma.center.findMany({
    where: operatorFilter(scope),
    select: { id: true, code: true, name: true, status: true },
    orderBy: { code: 'asc' },
  })
  // 새로 고를 수 있는 센터: 준비중·운영중 (0073)
  return textIds(
    centers.map(({ status, ...c }) => ({ ...c, isActive: isCenterSetupStatus(status) })),
  )
}

export type CenterChoice = Awaited<ReturnType<typeof getCenterChoices>>[number]

// 상속 칸의 위 단계 값 (운영사 기본값 — 화면에 "운영사 값: …"으로 보인다)
export async function getOperatorDefaults(scope: DataScope) {
  if (!scope.operatorId) return null
  const operator = await prisma.operator.findUnique({
    where: { id: scope.operatorId },
    select: {
      allocRule: true,
      useLot: true,
      useExpiry: true,
      useSerial: true,
      shipCutoffTime: true,
      closingDay: true,
    },
  })
  if (!operator) return null
  return {
    allocRule: operator.allocRule,
    useLot: isYes(operator.useLot),
    useExpiry: isYes(operator.useExpiry),
    useSerial: isYes(operator.useSerial),
    shipCutoffTime: dateToTime(operator.shipCutoffTime),
    closingDay: operator.closingDay,
  }
}

export type OperatorDefaults = NonNullable<Awaited<ReturnType<typeof getOperatorDefaults>>>
