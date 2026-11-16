import 'server-only'
import { dateToTime } from '@/lib/format/time'
import { prisma, type Db } from '@/lib/prisma'
import { isYes } from '@/lib/yn'

// 상속 설정 (docs/decisions/0073): 운영사 → 센터 → 화주사 순으로 아래 단계가 값을 정했으면 그것을 쓴다
// 센터·화주사 칸이 NULL이면 "위 단계 값을 따른다"는 뜻이다. 운영사 칸은 항상 값이 있다 (기본값)
//
//   실제 값 = 화주사 값 ?? 센터 값 ?? 운영사 값
//
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

// 값의 모양: 시각은 'HH:MM', 예/아니오는 boolean, 나머지는 글자
type SettingValue<K extends InheritedSettingKey> = K extends 'useLot' | 'useExpiry' | 'useSerial'
  ? boolean
  : string | null

export type SettingSource = 'SHIPPER' | 'CENTER' | 'OPERATOR'

// 단계별 값 (그 단계에 칸이 없으면 undefined, 칸은 있는데 비었으면 null)
export type SettingLevels<T> = { shipper?: T | null; center?: T | null; operator: T }

// 순수 함수: 아래 단계부터 처음으로 정해진 값과 그 출처
export function resolveInherited<T>(levels: SettingLevels<T>): { value: T; source: SettingSource } {
  if (levels.shipper !== undefined && levels.shipper !== null) {
    return { value: levels.shipper, source: 'SHIPPER' }
  }
  if (levels.center !== undefined && levels.center !== null) {
    return { value: levels.center, source: 'CENTER' }
  }
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
// 화주사는 로트·유통기한만 칸이 있다 (그 밖의 설정은 화주사 단계가 없어 센터 → 운영사)
export async function getEffectiveSetting<K extends InheritedSettingKey>(
  key: K,
  target: { centerId: bigint; shipperId?: bigint },
  db: Db = prisma,
): Promise<{ value: SettingValue<K>; source: SettingSource }> {
  const center = await db.center.findUniqueOrThrow({
    where: { id: target.centerId },
    select: {
      [key]: true,
      operator: { select: { [key]: true } },
    } as { operator: { select: Record<string, true> } } & Record<string, unknown>,
  })
  const row = center as unknown as Record<string, unknown> & { operator: Record<string, unknown> }
  let shipper: unknown = undefined
  if (target.shipperId !== undefined && (key === 'useLot' || key === 'useExpiry')) {
    const found = await db.shipper.findUniqueOrThrow({
      where: { id: target.shipperId },
      select: { [key]: true } as Record<string, true>,
    })
    shipper = (found as Record<string, unknown>)[key]
  }
  const resolved = resolveInherited({
    shipper: normalize(key, shipper),
    center: normalize(key, row[key]),
    operator: normalize(key, row.operator[key]),
  })
  return resolved as { value: SettingValue<K>; source: SettingSource }
}
