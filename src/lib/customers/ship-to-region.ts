import 'server-only'
import { currentActor } from '@/lib/actor'
import type { Db } from '@/lib/prisma'
import type { AddressSearcher } from '@/lib/regions/juso-client'
import { TEMP_ZONE_ALL } from '@/lib/regions/region-codes'
import { NOT_DELETED } from '@/lib/status'
import { assignShipToCenter, type ShipToCenterFields } from './ship-to-center'

// 납품처 배송센터 다시 정하기 (docs/decisions/0082 ② — 정의서 5번 "권역설정 변경 연동", 6번 "납품처 목록")
// 한 곳에서 계산하고 저장한다. 부르는 곳:
//   - 권역설정 저장 직후: 바뀐 우편번호에 걸린 납품처 (mode REGION)
//   - 납품처 목록 일괄 처리: 배송센터 일괄 지정(MANUAL) / 권역 기준으로 재지정(AUTO) / 재정제(RENORMALIZE)
// 모드별 규칙
//   REGION·RENORMALIZE: 지정 구분을 지킨다
//     - AUTO·확인 필요 → 주소로 다시 계산 (확인 필요가 풀리면 지정 완료로)
//     - MANUAL·IF → 센터는 그대로, 권역 기준 센터·불일치만 새로 (센터가 이용 불가가 되어도 센터는 두고 사람이 판단)
//   AUTO: 수동·연동 지정을 버리고 주소로 다시 계산
//   MANUAL: 고른 센터로 지정. 그 화주의 이용 센터가 아니거나 사용 중이 아니면 건너뛴다 (기존 값 유지)

export type ReassignMode =
  | { kind: 'REGION' }
  | { kind: 'RENORMALIZE' }
  | { kind: 'AUTO' }
  | { kind: 'MANUAL'; centerId: bigint }

export type ReassignResult = {
  total: number
  // 실제로 배송센터·지정 상태가 바뀐 곳
  changed: number
  // 지정 완료가 된 곳 / 확인 필요로 남은 곳 (처리한 납품처 기준)
  assigned: number
  needConfirm: number
  // MANUAL에서 그 화주의 이용 센터가 아니어서 건너뛴 곳
  skipped: { code: string; customerCode: string; reason: string }[]
}

const SHIP_TO_SELECT = {
  id: true,
  code: true,
  shipperId: true,
  customerId: true,
  rawZipCode: true,
  rawAddress: true,
  addressDetail: true,
  deliveryCenterId: true,
  centerAssignType: true,
  centerAssignStatus: true,
  centerAssignedAt: true,
  centerAssignedBy: true,
  customer: { select: { code: true } },
} as const

type ShipToRow = {
  id: bigint
  code: string
  shipperId: bigint
  customerId: bigint
  rawZipCode: string | null
  rawAddress: string
  addressDetail: string | null
  deliveryCenterId: bigint | null
  centerAssignType: string | null
  centerAssignStatus: string
  centerAssignedAt: Date | null
  centerAssignedBy: string | null
  customer: { code: string }
}

const isFixed = (row: ShipToRow) =>
  row.centerAssignStatus === 'ASSIGNED' &&
  (row.centerAssignType === 'MANUAL' || row.centerAssignType === 'IF')

// 납품처 여러 곳 다시 정하기 (부르는 쪽 트랜잭션 안에서). 바뀐 납품처의 거래처는 버전을 올린다
// → 열어 둔 거래처 화면이 옛 지정으로 덮어쓰지 못하고 "다른 사람이 고쳤습니다"로 막힌다
export async function reassignShipTos(
  db: Db,
  operatorId: bigint,
  ids: bigint[],
  mode: ReassignMode,
  options: { searcher?: AddressSearcher } = {},
): Promise<ReassignResult> {
  const rows: ShipToRow[] = await db.shipTo.findMany({
    where: { id: { in: [...new Set(ids)] }, operatorId, ...NOT_DELETED },
    select: SHIP_TO_SELECT,
    orderBy: { id: 'asc' },
  })
  const actor = currentActor()
  const result: ReassignResult = {
    total: rows.length,
    changed: 0,
    assigned: 0,
    needConfirm: 0,
    skipped: [],
  }
  const touchedCustomers = new Set<bigint>()

  for (const row of rows) {
    const keepCenter = (mode.kind === 'REGION' || mode.kind === 'RENORMALIZE') && isFixed(row)
    const assigned = await assignShipToCenter(db, {
      operatorId,
      shipperId: row.shipperId,
      rawZipCode: row.rawZipCode,
      rawAddress: row.rawAddress,
      addressDetail: row.addressDetail,
      centerId: mode.kind === 'MANUAL' ? mode.centerId : keepCenter ? row.deliveryCenterId : null,
      inputType: keepCenter ? (row.centerAssignType as 'IF' | 'MANUAL') : 'MANUAL',
      tempZone: TEMP_ZONE_ALL,
      useCache: mode.kind !== 'RENORMALIZE',
      searcher: options.searcher,
      actor,
    })
    let fields: ShipToCenterFields = assigned.fields
    if (mode.kind === 'MANUAL' && fields.centerAssignStatus !== 'ASSIGNED') {
      result.skipped.push({
        code: row.code,
        customerCode: row.customer.code,
        reason: assigned.fields.centerConfirmReason ?? 'NOT_SHIPPER_CENTER',
      })
      continue
    }
    if (keepCenter) {
      // 수동·연동 지정은 센터·구분·지정 시각을 그대로 두고, 권역 기준 센터와 불일치만 새로
      fields = {
        ...fields,
        deliveryCenterId: row.deliveryCenterId,
        centerAssignType: row.centerAssignType as 'IF' | 'MANUAL',
        centerAssignStatus: 'ASSIGNED',
        centerConfirmReason: null,
        regionMismatchYn:
          fields.regionCenterId !== null && fields.regionCenterId !== row.deliveryCenterId
            ? 'Y'
            : 'N',
        centerAssignedAt: row.centerAssignedAt,
        centerAssignedBy: row.centerAssignedBy,
      }
    }
    if (
      fields.deliveryCenterId !== row.deliveryCenterId ||
      fields.centerAssignStatus !== row.centerAssignStatus ||
      fields.centerAssignType !== row.centerAssignType
    ) {
      result.changed++
    }
    if (fields.centerAssignStatus === 'ASSIGNED') result.assigned++
    else result.needConfirm++
    await db.shipTo.update({ where: { id: row.id }, data: fields })
    touchedCustomers.add(row.customerId)
  }
  if (touchedCustomers.size > 0) {
    await db.customer.updateMany({ where: { id: { in: [...touchedCustomers] } }, data: {} })
  }
  return result
}

// ── 권역설정 변경 연동 ──

// 바뀌는 우편번호에 걸린 납품처: 정제 우편번호가 그 우편번호이거나,
// 법정동·시군구로 추정한 납품처(우편번호 범위로 센터를 정함)의 법정동이 그 우편번호에 속한 곳
export async function shipTosInZips(db: Db, operatorId: bigint, zips: string[]) {
  if (zips.length === 0) return []
  const bjds = await db.regionZipBjd.findMany({
    where: { zipCode: { in: zips } },
    select: { bjdCode: true },
  })
  const bjdCodes = [...new Set(bjds.map((b) => b.bjdCode))]
  return db.shipTo.findMany({
    where: {
      operatorId,
      ...NOT_DELETED,
      OR: [
        // 우편번호로 정한 납품처 (resolveLevel ZIP, 또는 아직 정하지 못해 비어 있음 — SQL NOT IN은 null을 빼므로 따로)
        { zipCode: { in: zips }, resolveLevel: { notIn: ['BJD', 'SIGUNGU'] } },
        { zipCode: { in: zips }, resolveLevel: null },
        ...(bjdCodes.length > 0
          ? [{ resolveLevel: { in: ['BJD', 'SIGUNGU'] }, regionCode: { in: bjdCodes } }]
          : []),
      ],
    },
    select: {
      id: true,
      zipCode: true,
      resolveLevel: true,
      deliveryCenterId: true,
      centerAssignType: true,
      centerAssignStatus: true,
    },
  })
}

export type ShipToRegionImpact = {
  // 권역 자동 지정 납품처 중 배송센터가 바뀌는 곳
  autoChange: number
  // 수동·연동 지정 납품처 중 새 권역 센터와 달라지는 곳 (센터는 그대로, 권역 불일치 표시)
  manualMismatch: number
  // 확인 필요 납품처 중 다시 지정을 시도할 곳
  needConfirmRetry: number
  // 법정동·시군구로 추정한 납품처 (저장 때 다시 계산 — 미리보기는 건수만)
  estimated: number
}

// 권역설정 미리보기의 납품처 영향 (온도대 행은 2차 — 납품처는 ALL 배정만 쓴다)
export async function shipToRegionImpact(
  db: Db,
  operatorId: bigint,
  tempZone: string,
  changes: { zipCode: string; after: { id: bigint } | null; confirmOnly: boolean }[],
): Promise<ShipToRegionImpact> {
  const impact: ShipToRegionImpact = {
    autoChange: 0,
    manualMismatch: 0,
    needConfirmRetry: 0,
    estimated: 0,
  }
  const moved = changes.filter((c) => !c.confirmOnly)
  if (tempZone !== TEMP_ZONE_ALL || moved.length === 0) return impact
  const afterOf = new Map(moved.map((c) => [c.zipCode, c.after?.id ?? null]))
  for (const s of await shipTosInZips(db, operatorId, [...afterOf.keys()])) {
    if (s.resolveLevel === 'BJD' || s.resolveLevel === 'SIGUNGU') {
      impact.estimated++
      continue
    }
    const after = afterOf.get(s.zipCode ?? '') ?? null
    if (s.centerAssignStatus === 'NEED_CONFIRM') {
      if (after !== null) impact.needConfirmRetry++
    } else if (s.centerAssignType === 'AUTO') {
      if (after !== s.deliveryCenterId) impact.autoChange++
    } else if (after !== null && after !== s.deliveryCenterId) {
      impact.manualMismatch++
    }
  }
  return impact
}

// 권역설정 저장 직후: 바뀐 우편번호의 납품처를 다시 정한다 (같은 트랜잭션 안)
export async function reassignAfterRegionChange(
  db: Db,
  operatorId: bigint,
  tempZone: string,
  zips: string[],
) {
  if (tempZone !== TEMP_ZONE_ALL || zips.length === 0) return null
  const targets = await shipTosInZips(db, operatorId, zips)
  if (targets.length === 0) return null
  return reassignShipTos(
    db,
    operatorId,
    targets.map((t) => t.id),
    { kind: 'REGION' },
  )
}
