import 'server-only'
import { dateToTime } from '@/lib/format/time'
import { prisma, type Db } from '@/lib/prisma'
import { isYes } from '@/lib/yn'

// 상속 설정 (docs/decisions/0073, 0080): 운영사 → 센터 → 화주사 → 화주사×센터 순으로 아래 단계가 값을 정했으면 그것을 쓴다
// 센터·화주사·화주사×센터 칸이 NULL이면 "위 단계 값을 따른다"는 뜻이다. 운영사 칸은 항상 값이 있다 (기본값)
//
//   실제 값 = 화주사×센터 값 ?? 화주사 값 ?? 센터 값 ?? 운영사 값   (구체적인 쪽이 이긴다)
//
// 화주사가 센터보다 앞서는 이유: 화주 계약 조건(로트·할당 규칙·출고 마감)이 센터 운영 방식보다 우선한다 (0080 조사 의견)
// 업무 코드(출고 마감·재고 할당·로트 검사 등)는 칸을 직접 읽지 말고 이 함수로 실제 값을 얻는다

export const INHERITED_SETTINGS = [
  'shipCutoffTime',
  'timezone',
  'allocRule',
  'useLot',
  'useExpiry',
  'useSerial',
] as const
export type InheritedSettingKey = (typeof INHERITED_SETTINGS)[number]

// 화주사·화주사×센터 단계에 칸이 있는 설정 (타임존은 센터 → 운영사만)
const SHIPPER_SETTINGS: readonly InheritedSettingKey[] = [
  'shipCutoffTime',
  'allocRule',
  'useLot',
  'useExpiry',
  'useSerial',
]

// 값의 모양: 시각은 'HH:MM', 예/아니오는 boolean, 나머지는 글자
type SettingValue<K extends InheritedSettingKey> = K extends 'useLot' | 'useExpiry' | 'useSerial'
  ? boolean
  : string | null

// 출처: 운영사 → 센터 → 화주사 → 화주사×센터 설정, 창고 → 로케이션 운영 속성 (0075)
export type SettingSource =
  'SHIPPER_CENTER' | 'SHIPPER' | 'CENTER' | 'OPERATOR' | 'LOCATION' | 'WAREHOUSE'

// 단계별 값 (그 단계에 칸이 없으면 undefined, 칸은 있는데 비었으면 null)
export type SettingLevels<T> = {
  shipperCenter?: T | null
  shipper?: T | null
  center?: T | null
  operator: T
}

const isSet = <T>(value: T | null | undefined): value is T => value !== undefined && value !== null

// 순수 함수: 아래 단계부터 처음으로 정해진 값과 그 출처
export function resolveInherited<T>(levels: SettingLevels<T>): { value: T; source: SettingSource } {
  if (isSet(levels.shipperCenter)) return { value: levels.shipperCenter, source: 'SHIPPER_CENTER' }
  if (isSet(levels.shipper)) return { value: levels.shipper, source: 'SHIPPER' }
  if (isSet(levels.center)) return { value: levels.center, source: 'CENTER' }
  return { value: levels.operator, source: 'OPERATOR' }
}

// DB의 칸 값 → 화면·업무 값 (시각 Date → 'HH:MM', 'Y'/'N' → boolean)
function normalize(key: InheritedSettingKey, raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw
  if (key === 'shipCutoffTime') return raw instanceof Date ? dateToTime(raw) : raw
  if (key === 'useLot' || key === 'useExpiry' || key === 'useSerial') return isYes(raw as string)
  return raw
}

// 센터(+화주사)에 적용되는 실제 설정 값
// 화주사를 주면 화주사 칸과, 그 화주사가 이 센터를 이용하면 화주사×센터 칸까지 본다
export async function getEffectiveSetting<K extends InheritedSettingKey>(
  key: K,
  target: { centerId: bigint; shipperId?: bigint },
  db: Db = prisma,
): Promise<{ value: SettingValue<K>; source: SettingSource }> {
  const pick = { [key]: true } as Record<string, true>
  const center = await db.center.findUniqueOrThrow({
    where: { id: target.centerId },
    select: { ...pick, operator: { select: pick } },
  })
  const row = center as unknown as Record<string, unknown> & { operator: Record<string, unknown> }
  let shipper: unknown = undefined
  let shipperCenter: unknown = undefined
  if (target.shipperId !== undefined && SHIPPER_SETTINGS.includes(key)) {
    const found = await db.shipper.findUniqueOrThrow({
      where: { id: target.shipperId },
      select: {
        ...pick,
        centers: { where: { centerId: target.centerId }, select: pick },
      },
    })
    const shipperRow = found as unknown as Record<string, unknown> & {
      centers: Record<string, unknown>[]
    }
    shipper = shipperRow[key]
    shipperCenter = shipperRow.centers[0]?.[key]
  }
  const resolved = resolveInherited({
    shipperCenter: normalize(key, shipperCenter),
    shipper: normalize(key, shipper),
    center: normalize(key, row[key]),
    operator: normalize(key, row.operator[key]),
  })
  return resolved as { value: SettingValue<K>; source: SettingSource }
}

// ── 로케이션 운영 속성 (0075): 실제 값 = 로케이션 값 ?? 창고 값 ──────────────
// 적치·피킹·할당 가능은 로케이션이 비워 두면(NULL) 창고 값을 따른다
export const LOCATION_INHERITED_OPS = ['inbound', 'outbound', 'allocatable'] as const
export type LocationOpKey = (typeof LOCATION_INHERITED_OPS)[number]
type OpsRow = { inboundYn: string | null; outboundYn: string | null; allocatableYn: string | null }
const OP_COLUMN = {
  inbound: 'inboundYn',
  outbound: 'outboundYn',
  allocatable: 'allocatableYn',
} as const

// 순수 함수: 로케이션·창고 칸 값 → 실제 값과 출처 (목록의 "적용값", 화면 상속 칸 안내)
export function resolveLocationOps(location: OpsRow, warehouse: OpsRow) {
  const result = {} as Record<LocationOpKey, { value: boolean; source: SettingSource }>
  for (const key of LOCATION_INHERITED_OPS) {
    const own = location[OP_COLUMN[key]]
    result[key] =
      own !== null
        ? { value: isYes(own), source: 'LOCATION' }
        : { value: isYes(warehouse[OP_COLUMN[key]] ?? 'N'), source: 'WAREHOUSE' }
  }
  return result
}

// 로케이션 한 칸의 실제 운영 속성 (업무 코드는 칸을 직접 읽지 말고 이 함수로)
export async function getEffectiveLocationOps(locationId: bigint, db: Db = prisma) {
  const ops = { inboundYn: true, outboundYn: true, allocatableYn: true } as const
  const location = await db.location.findUniqueOrThrow({
    where: { id: locationId },
    select: { ...ops, warehouse: { select: ops } },
  })
  return resolveLocationOps(location, location.warehouse)
}
