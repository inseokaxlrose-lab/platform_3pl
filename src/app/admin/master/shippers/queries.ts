import 'server-only'
import { toContactInput } from '@/lib/contacts/contact-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isActiveStatus, withIsActive } from '@/lib/status'
import { isYes } from '@/lib/yn'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'
import type { ShipperInput } from '@/lib/shippers/shipper-schema'

// 수정 화면용 화주사 한 건 (범위 밖이면 null → "찾을 수 없음")
// 센터 직원은 자기 센터를 이용하는 화주사만
export async function getShipperForEdit(id: bigint, scope: DataScope) {
  const shipper = await prisma.shipper.findUnique({
    where: { id },
    include: {
      centers: { select: { centerId: true } },
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
    centerIds: shipper.centers.map((c) => String(c.centerId)),
    useLot: isYes(shipper.useLot),
    useExpiry: isYes(shipper.useExpiry),
    labelUnit: shipper.labelUnit,
    contacts: shipper.contacts.map(toContactInput),
    externalCodes: await getExternalCodes('SHIPPER', id),
  }
  // 화면으로 보낼 값이라 키는 글자로
  return textIds({
    id: shipper.id,
    systemCode: shipper.systemCode,
    // 동시 수정 막기: 저장할 때 이 버전을 함께 보낸다
    rowVersion: shipper.rowVersion,
    isActive: isActiveStatus(shipper.status),
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

// 이용 센터로 고를 수 있는 센터 (전체 센터 — 사용 중지 센터는 이미 연결된 경우에만 보인다)
export async function getCenterChoices() {
  const centers = await prisma.center.findMany({
    select: { id: true, code: true, name: true, status: true },
    orderBy: { code: 'asc' },
  })
  return textIds(centers.map(withIsActive))
}

export type CenterChoice = Awaited<ReturnType<typeof getCenterChoices>>[number]
