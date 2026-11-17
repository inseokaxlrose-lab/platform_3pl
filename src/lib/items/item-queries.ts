import 'server-only'
import { textIds } from '@/lib/id'
import type { ItemFormOptions } from '@/lib/items/item-form-options'
import type { ItemInput } from '@/lib/items/item-schema'
import { prisma } from '@/lib/prisma'
import {
  isInScope,
  scopeFilter,
  sharedOperatorFilter,
  type DataScope,
} from '@/lib/scope/data-scope'
import { ACTIVE_ONLY, isActiveStatus } from '@/lib/status'
import { parseQty, qtyText } from '@/lib/units/convert'
import { isYes } from '@/lib/yn'
import { ITEM_SCOPE, SHIPPER_SCOPE } from './item-list'

// 품목 화면 조회 함수 (docs/decisions/0041) — 운영사 화면·화주 포털 공용. 서버 액션 밖이라 데이터 범위를 직접 건다

// 등록·수정 화면의 선택지: 범위 안의 사용 중인 화주사(품목 기본값 포함) + 단위(종류·소수 자리수)
// 단위는 사용 중지된 것도 넣는다 (이미 저장된 값을 이름으로 보여주기 위해, 새로 고를 때는 화면이 숨긴다)
export async function getItemFormOptions(scope: DataScope): Promise<ItemFormOptions> {
  const [shippers, units] = await Promise.all([
    prisma.shipper.findMany({
      where: {
        AND: [scopeFilter(scope, SHIPPER_SCOPE), ACTIVE_ONLY],
      },
      select: {
        id: true,
        code: true,
        name: true,
        useLot: true,
        useExpiry: true,
        labelUnit: true,
      },
      orderBy: { code: 'asc' },
    }),
    // 단위: 시스템 기본 단위 + 이 운영사의 추가 단위 (0078)
    prisma.unit.findMany({
      where: sharedOperatorFilter(scope),
      select: { id: true, code: true, name: true, type: true, decimals: true, status: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
  ])
  return textIds({
    shippers: shippers.map((s) => ({
      ...s,
      useLot: isYes(s.useLot),
      useExpiry: isYes(s.useExpiry),
    })),
    units: units.map(({ status, ...u }) => ({ ...u, isActive: isActiveStatus(status) })),
  })
}

// 수정 화면용 품목 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getItemForEdit(id: bigint, scope: DataScope) {
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      shipper: { select: { code: true, name: true, centers: { select: { centerId: true } } } },
      units: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!item || !isInScope(scope, item, ITEM_SCOPE)) return null
  const input: ItemInput = {
    code: item.code,
    name: item.name,
    spec: item.spec ?? '',
    barcode: item.barcode ?? '',
    baseUnitId: String(item.baseUnitId),
    useLot: (item.useLot ?? '') as ItemInput['useLot'],
    useExpiry: (item.useExpiry ?? '') as ItemInput['useExpiry'],
    labelUnit: item.labelUnit ?? '',
    expiryAlertDays: item.expiryAlertDays === null ? '' : String(item.expiryAlertDays),
    remark: item.remark ?? '',
    units: item.units.map((u) => ({
      unitId: String(u.unitId),
      // Decimal → 글자 (끝의 0은 뺀다: 24.000 → '24', 단위 환산 공통 함수로 정확하게)
      convQty: qtyText(parseQty(u.convQty.toString())),
    })),
  }
  return textIds({
    id: item.id,
    systemCode: item.systemCode,
    rowVersion: item.rowVersion,
    isActive: isActiveStatus(item.status),
    shipperId: item.shipperId,
    shipper: `${item.shipper.name} (${item.shipper.code})`,
    input,
  })
}

export type ItemForEdit = NonNullable<Awaited<ReturnType<typeof getItemForEdit>>>
