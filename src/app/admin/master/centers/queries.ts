import 'server-only'
import { DEFAULT_WORK_DAYS, type CenterInput } from '@/lib/centers/center-schema'
import { dateToTime } from '@/lib/format/time'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { NOT_DELETED, withIsActive } from '@/lib/status'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'
import { toContactInput } from '@/lib/contacts/contact-schema'
import { isYes } from '@/lib/yn'
import { WAREHOUSE_TYPE } from '@/lib/warehouses/warehouse-codes'

// 등록 화면에 보여 줄 운영사 값 (상속 칸의 "운영사 값" 안내, 0073)
export async function getOperatorDefaults(operatorId: bigint) {
  const operator = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    select: { shipCutoffTime: true },
  })
  return { shipCutoffTime: dateToTime(operator.shipCutoffTime) }
}

// 수정 화면용 센터 한 건 (데이터 범위 밖이면 null → 화면은 "찾을 수 없음")
export async function getCenterForEdit(id: bigint, scope: DataScope) {
  const center = await prisma.center.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { sortOrder: 'asc' } },
      tempZones: { select: { tempZoneCd: true } },
      // 관계 목록·개수는 지운 줄을 직접 뺀다 (NOT_DELETED)
      warehouses: {
        where: NOT_DELETED,
        select: {
          id: true,
          systemCode: true,
          code: true,
          name: true,
          type: true,
          tempZone: true,
          systemYn: true,
          status: true,
          _count: { select: { locations: { where: NOT_DELETED } } },
        },
        // 창고 정렬순서(기본 창고 입고 → 출고 → 반품이 앞) → 코드
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      },
      deliveryZones: {
        where: NOT_DELETED,
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          regions: { select: { regionCode: true } },
        },
        orderBy: { code: 'asc' },
      },
    },
  })
  // 범위(운영사·소속 센터) 밖이면 없는 것으로
  if (!center || !isInScope(scope, center, { center: 'id' })) return null

  const [operator, locations] = await Promise.all([
    getOperatorDefaults(center.operatorId),
    // 기본 로케이션 고르기: 이 센터의 사용 중인 로케이션 (창고 정렬순서 → 기본 창고가 앞)
    prisma.location.findMany({
      where: { status: 'ACTIVE', warehouse: { centerId: id, delYn: 'N' } },
      select: {
        id: true,
        code: true,
        name: true,
        warehouse: { select: { code: true, name: true, type: true } },
      },
      orderBy: [
        { warehouse: { sortOrder: 'asc' } },
        { warehouse: { code: 'asc' } },
        { code: 'asc' },
      ],
      take: 3000,
    }),
  ])

  const text = (value: string | null) => value ?? ''
  const input: CenterInput = {
    name: center.name,
    nameEn: text(center.nameEn),
    shortName: text(center.shortName),
    type: center.type,
    openedOn: center.openedOn ? center.openedOn.toISOString().slice(0, 10) : '',
    businessNumber: text(center.businessNumber),
    subBizNo: text(center.subBizNo),
    sortOrder: center.sortOrder,
    remark: text(center.remark),
    zipCode: text(center.zipCode),
    address: text(center.address),
    addressDetail: text(center.addressDetail),
    addressJibun: text(center.addressJibun),
    regionName: text(center.regionName),
    phone: text(center.phone),
    fax: text(center.fax),
    email: text(center.email),
    directions: text(center.directions),
    floorAreaM2: center.floorAreaM2?.toString() ?? '',
    storageAreaM2: center.storageAreaM2?.toString() ?? '',
    dockCount: center.dockCount,
    tempZones: center.tempZones.map((z) => z.tempZoneCd),
    bondedYn: isYes(center.bondedYn),
    workStartTime: dateToTime(center.workStartTime),
    workEndTime: dateToTime(center.workEndTime),
    workDays: center.workDays || DEFAULT_WORK_DAYS,
    inboundCutoffTime: dateToTime(center.inboundCutoffTime),
    shipCutoffTime: dateToTime(center.shipCutoffTime),
    defaultInboundLocId: center.defaultInboundLocId?.toString() ?? '',
    defaultOutboundLocId: center.defaultOutboundLocId?.toString() ?? '',
    defaultReturnLocId: center.defaultReturnLocId?.toString() ?? '',
    contacts: center.contacts.map((c) => ({ ...toContactInput(c), id: c.id.toString() })),
  }
  // 화면으로 보낼 값이라 키는 글자로
  return textIds({
    id: center.id,
    code: center.code,
    systemCode: center.systemCode,
    // 동시 수정 막기: 저장할 때 이 버전을 함께 보낸다
    rowVersion: center.rowVersion,
    status: center.status,
    statusReason: center.statusReason,
    closedOn: center.closedOn ? center.closedOn.toISOString().slice(0, 10) : null,
    updatedAt: center.updatedAt,
    updatedBy: center.updatedBy,
    input,
    // 상속 칸의 운영사 값
    operator,
    locationOptions: locations.map((l) => ({
      value: l.id.toString(),
      label: l.code,
      description: `${WAREHOUSE_TYPE.labels[l.warehouse.type as keyof typeof WAREHOUSE_TYPE.labels] ?? l.warehouse.type} · ${l.warehouse.name}${l.name && l.name !== l.code ? ` · ${l.name}` : ''}`,
      keywords: `${l.warehouse.code} ${l.name ?? ''}`,
    })),
    warehouses: center.warehouses.map(withIsActive).map(({ _count, ...w }) => ({
      ...w,
      locationCount: _count.locations,
    })),
    deliveryZones: center.deliveryZones.map(withIsActive).map(({ regions, ...z }) => ({
      ...z,
      regionCodes: regions.map((r) => r.regionCode),
    })),
  })
}

export type CenterForEdit = NonNullable<Awaited<ReturnType<typeof getCenterForEdit>>>
