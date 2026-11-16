import 'server-only'
import { toContactInput } from '@/lib/contacts/contact-schema'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { ACTIVE_ONLY, NOT_DELETED, isActiveStatus } from '@/lib/status'
import { CUSTOMER_SCOPE, SHIPPER_SCOPE } from './customer-list'
import type { CustomerInput } from './customer-schema'

// 거래처 화면 조회 함수 (docs/decisions/0043) — 서버 액션 밖이라 데이터 범위를 직접 건다

// 등록 화면의 화주사 선택지: 범위 안의 사용 중인 화주사
export async function getCustomerShipperOptions(scope: DataScope) {
  const shippers = await prisma.shipper.findMany({
    where: { AND: [scopeFilter(scope, SHIPPER_SCOPE), ACTIVE_ONLY] },
    select: {
      id: true,
      code: true,
      name: true,
      // 배송 센터 고르기 (0072): 이 화주사가 이용하는 사용 중인 센터
      centers: {
        where: { center: { ...ACTIVE_ONLY, ...NOT_DELETED } },
        select: { center: { select: { id: true, code: true, name: true } } },
        orderBy: { center: { code: 'asc' } },
      },
    },
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

// 수정 화면용 거래처 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getCustomerForEdit(id: bigint, scope: DataScope) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      shipper: {
        select: {
          code: true,
          name: true,
          centers: {
            select: {
              centerId: true,
              center: { select: { id: true, code: true, name: true, status: true, delYn: true } },
            },
          },
        },
      },
      contacts: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!customer || !isInScope(scope, customer, CUSTOMER_SCOPE)) return null
  const text = (value: string | null) => value ?? ''
  const input: CustomerInput = {
    code: customer.code,
    name: customer.name,
    businessNumber: text(customer.businessNumber),
    ceoName: text(customer.ceoName),
    phone: text(customer.phone),
    email: text(customer.email),
    zipCode: text(customer.zipCode),
    address: text(customer.address),
    addressDetail: text(customer.addressDetail),
    regionCode: text(customer.regionCode),
    receiverName: text(customer.receiverName),
    receiverPhone: text(customer.receiverPhone),
    deliveryMemo: text(customer.deliveryMemo),
    deliveryCenterId: customer.deliveryCenterId ? String(customer.deliveryCenterId) : '',
    remark: text(customer.remark),
    contacts: customer.contacts.map(toContactInput),
  }
  return textIds({
    id: customer.id,
    systemCode: customer.systemCode,
    rowVersion: customer.rowVersion,
    isActive: isActiveStatus(customer.status),
    shipperId: customer.shipperId,
    shipper: `${customer.shipper.name} (${customer.shipper.code})`,
    // 배송 센터로 고를 수 있는 센터 (0072): 이 화주사가 이용하는 사용 중인 센터
    deliveryCenters: customer.shipper.centers
      .map((c) => c.center)
      .filter((c) => isActiveStatus(c.status) && c.delYn === 'N')
      .map(({ id, code, name }) => ({ id, code, name }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    updatedBy: customer.updatedBy,
    updatedAt: customer.updatedAt,
    input,
  })
}

export type CustomerForEdit = NonNullable<Awaited<ReturnType<typeof getCustomerForEdit>>>
