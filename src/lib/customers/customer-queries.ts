import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { toContactInput } from '@/lib/contacts/contact-schema'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { NOT_DELETED } from '@/lib/status'
import { isYes } from '@/lib/yn'
import { CUSTOMER_SCOPE, SHIPPER_SCOPE } from './customer-list'
import type { CustomerInput, ShipToInput } from './customer-schema'
import { SHIPPER_SETUP_ONLY } from '@/lib/shippers/shipper-codes'

// 거래처 화면 조회 함수 (docs/decisions/0043, 0082) — 서버 액션 밖이라 데이터 범위를 직접 건다

// 배송센터로 고를 수 있는 센터: 화주사의 이용 중(ACTIVE) 센터 중 일시중지·폐쇄가 아닌 센터
const CENTER_CHOICE = {
  where: {
    status: 'ACTIVE',
    center: { status: { notIn: ['SUSPENDED', 'CLOSED'] }, ...NOT_DELETED },
  },
  select: { center: { select: { id: true, code: true, name: true } } },
  orderBy: { center: { code: 'asc' as const } },
}

// 수정 화면: 데이터 범위 검사(이용 센터 전체의 centerId)와 배송센터 선택지를 한 번에 읽는다
const SHIPPER_CENTERS = {
  select: {
    centerId: true,
    status: true,
    center: { select: { id: true, code: true, name: true, status: true, delYn: true } },
  },
  orderBy: { center: { code: 'asc' as const } },
}
type ShipperCenterRow = {
  status: string
  center: { id: bigint; code: string; name: string; status: string; delYn: string }
}
// CENTER_CHOICE와 같은 조건을 코드로
const isCenterChoice = (c: ShipperCenterRow) =>
  c.status === 'ACTIVE' &&
  !['SUSPENDED', 'CLOSED'].includes(c.center.status) &&
  !isYes(c.center.delYn)

// 등록 화면의 화주사 선택지: 범위 안의 준비중·운영중 화주사 + 그 화주사의 배송센터 선택지
export async function getCustomerShipperOptions(scope: DataScope) {
  const shippers = await prisma.shipper.findMany({
    where: { AND: [scopeFilter(scope, SHIPPER_SCOPE), SHIPPER_SETUP_ONLY] },
    select: { id: true, code: true, name: true, centers: CENTER_CHOICE },
    orderBy: { code: 'asc' },
  })
  return textIds(
    shippers.map(({ centers, ...shipper }) => ({
      ...shipper,
      centers: centers.map((c) => c.center),
    })),
  )
}

export type CustomerShipperOption = Awaited<ReturnType<typeof getCustomerShipperOptions>>[number]

// DB 행(담당자·지우지 않은 납품처 포함) → 입력값 모양. 수정 화면과 연동 upsert(보낸 칸만 덮어쓰기)가 같이 쓴다
export function customerInputOf(customer: CustomerInputSource): CustomerInput {
  const text = (value: string | null) => value ?? ''
  const shipTos: ShipToInput[] = customer.shipTos.map((s) => {
    const manual = s.centerAssignType === 'MANUAL' || s.centerAssignType === 'IF'
    return {
      id: String(s.id),
      code: s.code,
      name: s.name,
      isDefault: isYes(s.isDefault),
      addrSync: isYes(s.addrSyncYn),
      status: s.status,
      // 원본 주소를 입력 칸에 (정제 결과는 아래 표시용 shipToInfo)
      zipCode: text(s.rawZipCode),
      address: s.rawAddress,
      addressDetail: text(s.addressDetail),
      regionCode: text(s.regionCode),
      receiverName: text(s.receiverName),
      receiverPhone: text(s.receiverPhone),
      receiverPhone2: text(s.receiverPhone2),
      deliveryMemo: text(s.deliveryMemo),
      centerMode: manual ? 'MANUAL' : 'AUTO',
      deliveryCenterId: manual && s.deliveryCenterId ? String(s.deliveryCenterId) : '',
      remark: text(s.remark),
    }
  })
  return {
    name: customer.name,
    shortName: text(customer.shortName),
    customerType: text(customer.customerType),
    customerGroup: text(customer.customerGroup),
    businessNumber: text(customer.businessNumber),
    ceoName: text(customer.ceoName),
    orderAddrMode: customer.orderAddrMode,
    phone: text(customer.phone),
    fax: text(customer.fax),
    email: text(customer.email),
    zipCode: text(customer.rawZipCode ?? customer.zipCode),
    address: text(customer.rawAddress ?? customer.address),
    addressDetail: text(customer.addressDetail),
    addressJibun: text(customer.addressJibun),
    regionCode: text(customer.regionCode),
    minShelfDays: customer.minShelfDays,
    minShelfRatio: customer.minShelfRatio?.toString() ?? '',
    remark: text(customer.remark),
    contacts: customer.contacts.map(toContactInput),
    shipTos,
  } satisfies CustomerInput
}

// customerInputOf에 필요한 칸
export type CustomerInputSource = Prisma.CustomerGetPayload<{
  include: { contacts: true; shipTos: true }
}>

// 수정 화면용 거래처 한 건 + 납품처 (범위 밖이면 null → "찾을 수 없음")
export async function getCustomerForEdit(id: bigint, scope: DataScope) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      shipper: { select: { code: true, name: true, centers: SHIPPER_CENTERS } },
      contacts: { orderBy: { sortOrder: 'asc' } },
      shipTos: {
        where: NOT_DELETED,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: {
          deliveryCenter: { select: { code: true, name: true } },
          regionCenter: { select: { code: true, name: true } },
        },
      },
    },
  })
  if (!customer || !isInScope(scope, customer, CUSTOMER_SCOPE)) return null
  const input = customerInputOf(customer)
  return textIds({
    id: customer.id,
    code: customer.code,
    systemCode: customer.systemCode,
    rowVersion: customer.rowVersion,
    status: customer.status,
    source: customer.source,
    lastIfAt: customer.lastIfAt,
    lastRequestId: customer.lastRequestId,
    addressGrade: customer.addressGrade,
    shipperId: customer.shipperId,
    shipper: `${customer.shipper.name} (${customer.shipper.code})`,
    deliveryCenters: customer.shipper.centers
      .filter(isCenterChoice)
      .map(({ center }) => ({ id: center.id, code: center.code, name: center.name })),
    // 납품처 표에 보일 지정 결과 (저장된 값 — 화면에서 고치면 저장 때 다시 계산)
    shipToInfo: customer.shipTos.map((s) => ({
      id: s.id,
      systemCreated: isYes(s.systemCreatedYn),
      sigunguName: s.sigunguName,
      address: s.address,
      addressGrade: s.addressGrade,
      deliveryCenter: s.deliveryCenter
        ? `${s.deliveryCenter.name} (${s.deliveryCenter.code})`
        : null,
      regionCenter: s.regionCenter ? `${s.regionCenter.name} (${s.regionCenter.code})` : null,
      centerAssignType: s.centerAssignType,
      centerAssignStatus: s.centerAssignStatus,
      centerConfirmReason: s.centerConfirmReason,
      regionMismatch: isYes(s.regionMismatchYn),
    })),
    updatedBy: customer.updatedBy,
    updatedAt: customer.updatedAt,
    input,
  })
}

export type CustomerForEdit = NonNullable<Awaited<ReturnType<typeof getCustomerForEdit>>>
export type ShipToInfo = CustomerForEdit['shipToInfo'][number]
