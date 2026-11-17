import 'server-only'
import { TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import { ActionError } from '@/lib/actions/action-error'
import type { Db } from '@/lib/prisma'
import { REGION_CHANGE_TYPE, TEMP_ZONE_ALL } from './region-codes'

// 권역 배정 저장 공통 (docs/decisions/0076, docs/specs 권역설정 "변경 미리보기")
// 모든 저장(트리·표·붙여넣기·엑셀·해제·추천 확인)은 같은 두 단계를 거친다
//   planRegionChange: 우편번호마다 전·후 센터를 계산해 미리보기 (DB는 바꾸지 않음)
//   applyRegionChange: 같은 계산을 다시 하고 작업 단위 1건 + 배정표 + 이력을 한 트랜잭션으로
// 배정이 없는 우편번호 = 미배정 (행을 만들지 않음). 온도대 행을 해제하면 ALL 배정으로 돌아간다

export type ChangeType = (typeof REGION_CHANGE_TYPE.values)[number]

export type RegionChangeInput = {
  zips: string[]
  tempZone: string // 'ALL' 또는 온도대
  centerId: bigint | null // null = 배정 해제
}

type CenterRef = { id: bigint; name: string }

export type PlannedChange = {
  zipCode: string
  mapId: bigint | null
  before: CenterRef | null
  after: CenterRef | null
  // 같은 센터지만 추천 배정(확인 전)을 사용자 지정으로 바꾸는 경우
  confirmOnly: boolean
}

export type RegionChangePlan = {
  changes: PlannedChange[]
  unchanged: number
  // 지역 마스터에 없거나 폐지된 우편번호 (붙여넣기·엑셀에서)
  invalid: { zipCode: string; reason: string }[]
  // 미리보기 요약: '이천 → 평택 132건', '미배정 → 평택 4건'
  summary: { from: string | null; to: string | null; count: number }[]
}

const CHUNK = 1000
const chunks = <T>(list: T[]) =>
  Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) =>
    list.slice(i * CHUNK, (i + 1) * CHUNK),
  )

// 배정할 수 있는 센터: 이 운영사의 준비중·운영중 센터, 온도대 행이면 그 온도대를 취급
export async function assertAssignableCenter(
  db: Db,
  operatorId: bigint,
  centerId: bigint,
  tempZone: string,
) {
  const center = await db.center.findFirst({
    where: { id: centerId, operatorId },
    select: { id: true, name: true, status: true, tempZones: { select: { tempZoneCd: true } } },
  })
  if (!center) throw new ActionError('NOT_FOUND', '센터를 찾을 수 없습니다.')
  if (center.status !== 'ACTIVE' && center.status !== 'PREPARING') {
    throw new ActionError(
      'CONFLICT',
      `준비중·운영중 센터에만 배정할 수 있습니다 (${center.name}: ${center.status === 'SUSPENDED' ? '일시중지' : '폐쇄'}).`,
    )
  }
  if (tempZone !== TEMP_ZONE_ALL && !center.tempZones.some((z) => z.tempZoneCd === tempZone)) {
    throw new ActionError(
      'CONFLICT',
      `${center.name}은(는) ${TEMP_ZONE.labels[tempZone as TempZoneKey] ?? tempZone} 온도대를 취급하지 않습니다.`,
    )
  }
  return { id: center.id, name: center.name }
}

export async function planRegionChange(
  db: Db,
  operatorId: bigint,
  input: RegionChangeInput,
): Promise<RegionChangePlan> {
  const unique = [...new Set(input.zips)]
  const after = input.centerId
    ? await assertAssignableCenter(db, operatorId, input.centerId, input.tempZone)
    : null

  const known = new Map(
    (
      await db.regionZip.findMany({
        where: { code: { in: unique } },
        select: { code: true, abolishedYn: true },
      })
    ).map((z) => [z.code, z.abolishedYn]),
  )
  const invalid: RegionChangePlan['invalid'] = []
  const valid: string[] = []
  for (const zip of unique) {
    const abolished = known.get(zip)
    if (abolished === undefined) invalid.push({ zipCode: zip, reason: '없는 우편번호' })
    // 폐지 우편번호는 배정 해제만 된다 (배정은 유지되고 화면에 '폐지'로 보인다)
    else if (abolished === 'Y' && after) invalid.push({ zipCode: zip, reason: '폐지된 우편번호' })
    else valid.push(zip)
  }

  const current = new Map(
    (
      await db.regionCenterMap.findMany({
        where: { operatorId, tempZone: input.tempZone, zipCode: { in: valid } },
        select: {
          id: true,
          zipCode: true,
          confirmYn: true,
          center: { select: { id: true, name: true } },
        },
      })
    ).map((m) => [m.zipCode, m]),
  )

  const changes: PlannedChange[] = []
  let unchanged = 0
  for (const zip of valid) {
    const map = current.get(zip)
    const before = map ? map.center : null
    const same = (before?.id ?? null) === (after?.id ?? null)
    if (same && (!map || map.confirmYn === 'Y')) {
      unchanged++
      continue
    }
    changes.push({ zipCode: zip, mapId: map?.id ?? null, before, after, confirmOnly: same })
  }

  const groups = new Map<string, RegionChangePlan['summary'][number]>()
  for (const c of changes) {
    const key = `${c.before?.id ?? ''}>${c.after?.id ?? ''}`
    const group = groups.get(key) ?? {
      from: c.before?.name ?? null,
      to: c.after?.name ?? null,
      count: 0,
    }
    group.count++
    groups.set(key, group)
  }
  return {
    changes,
    unchanged,
    invalid,
    summary: [...groups.values()].sort((a, b) => b.count - a.count),
  }
}

// 저장 (한 트랜잭션 안에서 부른다)
export async function applyRegionChange(
  tx: Db,
  operatorId: bigint,
  input: RegionChangeInput & {
    changeType: ChangeType
    scopeDesc: string
    reason?: string | null
    assignType?: 'MANUAL' | 'UPLOAD' | 'SUGGESTED'
  },
) {
  const plan = await planRegionChange(tx, operatorId, input)
  const batch = await tx.regionChangeBatch.create({
    data: {
      operatorId,
      changeType: input.changeType,
      scopeDesc: input.scopeDesc.slice(0, 500),
      tempZone: input.tempZone,
      targetCenterId: input.centerId,
      changedCount: plan.changes.length,
      reason: input.reason?.trim() || null,
    },
  })
  if (plan.changes.length === 0) return { batchId: batch.id, plan }

  const assignType = input.assignType ?? 'MANUAL'
  const confirmYn = assignType === 'SUGGESTED' ? 'N' : 'Y'
  const toCreate = plan.changes.filter((c) => !c.mapId && c.after)
  const toUpdate = plan.changes.filter((c) => c.mapId && c.after)
  const toDelete = plan.changes.filter((c) => c.mapId && !c.after)

  for (const part of chunks(toCreate)) {
    await tx.regionCenterMap.createMany({
      data: part.map((c) => ({
        operatorId,
        zipCode: c.zipCode,
        tempZone: input.tempZone,
        centerId: input.centerId!,
        assignType,
        confirmYn,
        lastBatchId: batch.id,
      })),
    })
  }
  for (const part of chunks(toUpdate)) {
    await tx.regionCenterMap.updateMany({
      where: { id: { in: part.map((c) => c.mapId!) } },
      data: { centerId: input.centerId!, assignType, confirmYn, lastBatchId: batch.id },
    })
  }
  for (const part of chunks(toDelete)) {
    await tx.regionCenterMap.deleteMany({ where: { id: { in: part.map((c) => c.mapId!) } } })
  }
  // 이력은 센터가 바뀐 것만 (추천 확인처럼 같은 센터면 작업 단위·배정표의 최종 작업으로 남는다)
  for (const part of chunks(plan.changes.filter((c) => !c.confirmOnly))) {
    await tx.regionCenterMapHist.createMany({
      data: part.map((c) => ({
        batchId: batch.id,
        operatorId,
        zipCode: c.zipCode,
        tempZone: input.tempZone,
        beforeCenterId: c.before?.id ?? null,
        afterCenterId: c.after?.id ?? null,
      })),
    })
  }
  return { batchId: batch.id, plan }
}

// 추천 배정 확인: 센터는 그대로, 확인 여부만 Y
// 센터가 바뀌지 않으므로 이력 줄은 만들지 않고 작업 단위(CONFIRM)와 배정표의 최종 작업으로 남긴다
export async function confirmSuggested(
  tx: Db,
  operatorId: bigint,
  input: { zips: string[]; tempZone: string },
) {
  const maps = await tx.regionCenterMap.findMany({
    where: { operatorId, tempZone: input.tempZone, zipCode: { in: input.zips }, confirmYn: 'N' },
    select: { id: true, zipCode: true, centerId: true },
  })
  const batch = await tx.regionChangeBatch.create({
    data: {
      operatorId,
      changeType: 'CONFIRM',
      scopeDesc: `추천 배정 확인 ${maps.length}건`,
      tempZone: input.tempZone,
      changedCount: maps.length,
    },
  })
  if (maps.length > 0) {
    await tx.regionCenterMap.updateMany({
      where: { id: { in: maps.map((m) => m.id) } },
      data: { confirmYn: 'Y', lastBatchId: batch.id },
    })
  }
  return { batchId: batch.id, count: maps.length }
}

// 특정 날짜 기준 이 우편번호의 배송센터 (정산·클레임 확인용): 이력으로 그 시각의 배정을 되짚는다
// 온도대 행이 그때 있었으면 그 센터, 없었으면 ALL 행
export async function centerAtDate(
  db: Db,
  operatorId: bigint,
  zipCode: string,
  at: Date,
  tempZone: string = TEMP_ZONE_ALL,
) {
  const last = async (tz: string) =>
    db.regionCenterMapHist.findFirst({
      where: { operatorId, zipCode, tempZone: tz, changedAt: { lte: at } },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      select: { afterCenterId: true },
    })
  if (tempZone !== TEMP_ZONE_ALL) {
    const own = await last(tempZone)
    if (own?.afterCenterId) return own.afterCenterId
  }
  return (await last(TEMP_ZONE_ALL))?.afterCenterId ?? null
}
