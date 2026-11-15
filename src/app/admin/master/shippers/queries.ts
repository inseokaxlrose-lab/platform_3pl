import 'server-only'
import { toContactInput } from '@/lib/contacts/contact-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'
import type { ShipperInput } from '@/lib/shippers/shipper-schema'

// 수정 화면용 화주사 한 건 (범위 밖이면 null → "찾을 수 없음")
// 센터 직원은 자기 센터를 이용하는 화주사만
export async function getShipperForEdit(id: string, scope: DataScope) {
  const shipper = await prisma.shipper.findUnique({
    where: { id },
    include: {
      centers: { select: { centerId: true } },
      contacts: { orderBy: { sortOrder: 'asc' } },
      users: {
        select: { id: true, name: true, username: true, displayUsername: true, isActive: true },
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
    name: shipper.name,
    businessNumber: text(shipper.businessNumber),
    ceoName: text(shipper.ceoName),
    businessType: text(shipper.businessType),
    businessItem: text(shipper.businessItem),
    phone: text(shipper.phone),
    fax: text(shipper.fax),
    email: text(shipper.email),
    zipCode: text(shipper.zipCode),
    address: text(shipper.address),
    addressDetail: text(shipper.addressDetail),
    centerIds: shipper.centers.map((c) => c.centerId),
    useLot: shipper.useLot,
    useExpiry: shipper.useExpiry,
    labelUnit: shipper.labelUnit,
    contacts: shipper.contacts.map(toContactInput),
    externalCodes: await getExternalCodes('SHIPPER', id),
  }
  return {
    id: shipper.id,
    systemCode: shipper.systemCode,
    isActive: shipper.isActive,
    input,
    users: shipper.users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.displayUsername ?? u.username ?? '',
      isActive: u.isActive,
    })),
  }
}

export type ShipperForEdit = NonNullable<Awaited<ReturnType<typeof getShipperForEdit>>>

// 이용 센터로 고를 수 있는 센터 (전체 센터 — 사용 중지 센터는 이미 연결된 경우에만 보인다)
export async function getCenterChoices() {
  return prisma.center.findMany({
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: { code: 'asc' },
  })
}

export type CenterChoice = Awaited<ReturnType<typeof getCenterChoices>>[number]
