import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { ACTIVE_ONLY, NOT_DELETED } from '@/lib/status'
import type { LengthUnit, WeightUnit } from '@/lib/units/dimension'
import { isSystemWarehouse } from '@/lib/warehouses/warehouse-codes'
import { isYes } from '@/lib/yn'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'

// 로케이션 화면이 쓰는 고르기 값 (docs/decisions/0075)
// - 창고: 데이터 범위 안 + 사용 중인 센터의 사용 중인 창고, 센터 정렬순서 → 창고 정렬순서 → 코드 순
//   addable(로케이션을 추가할 수 있는지), 운영 속성(상속 칸의 "창고 값"), 온도대·보세·위험물(읽기 전용 안내)
// - 구역: 그 창고들의 사용 중인 구역 (정렬순서 → 코드)
// - 단위: 운영사의 길이·무게 단위 (용량 칸 라벨·변환)
export async function getLocationOptions(scope: DataScope) {
  const [warehouses, zones, operator] = await Promise.all([
    prisma.warehouse.findMany({
      where: {
        AND: [scopeFilter(scope, { center: 'centerId' }), { center: ACTIVE_ONLY }, ACTIVE_ONLY],
      },
      select: {
        id: true,
        code: true,
        name: true,
        systemYn: true,
        tempZone: true,
        bondedYn: true,
        hazmatYn: true,
        inboundYn: true,
        outboundYn: true,
        allocatableYn: true,
        locCodeSeparator: true,
        center: { select: { id: true, code: true, name: true } },
      },
      orderBy: [
        { center: { sortOrder: 'asc' } },
        { center: { code: 'asc' } },
        { sortOrder: 'asc' },
        { code: 'asc' },
      ],
    }),
    prisma.zone.findMany({
      where: { AND: [scopeFilter(scope, { center: 'centerId' }), ACTIVE_ONLY, NOT_DELETED] },
      select: { id: true, warehouseId: true, code: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.operator.findUnique({
      where: { id: scope.operatorId },
      select: { lengthUnit: true, weightUnit: true },
    }),
  ])
  // 화면으로 보낼 값이라 키는 글자로
  return textIds({
    warehouses: warehouses.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      label: `${w.name} (${w.code})`,
      centerId: w.center.id,
      centerCode: w.center.code,
      centerName: w.center.name,
      centerLabel: `${w.center.name} (${w.center.code})`,
      // 시스템 기본 창고에는 로케이션을 더 만들 수 없다 (DEFAULT 하나만)
      addable: !isSystemWarehouse(w),
      tempZone: w.tempZone,
      bonded: isYes(w.bondedYn),
      hazmat: isYes(w.hazmatYn),
      ops: {
        inbound: isYes(w.inboundYn),
        outbound: isYes(w.outboundYn),
        allocatable: isYes(w.allocatableYn),
      },
      separator: w.locCodeSeparator ?? '-',
    })),
    zones,
    units: {
      length: (operator?.lengthUnit ?? 'CM') as LengthUnit,
      weight: (operator?.weightUnit ?? 'KG') as WeightUnit,
    },
  })
}

export type LocationOptions = Awaited<ReturnType<typeof getLocationOptions>>
export type WarehouseOption = LocationOptions['warehouses'][number]
export type ZoneOption = LocationOptions['zones'][number]
