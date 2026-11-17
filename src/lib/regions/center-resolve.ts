import 'server-only'
import type { Db } from '@/lib/prisma'
import { getBjdIndex, type NormResult } from './address-normalize'
import { sigunguScope } from './address-text-parse'
import { ADDR_GRADE, gradeAtLeast, TEMP_ZONE_ALL, type AddrGrade } from './region-codes'

// 배송센터 결정 함수 (docs/address-normalization.md "배송센터 결정", 0076)
// 정제 결과 → 우편번호 배정표로 센터. 등급마다 보는 우편번호 범위만 다르고 판단은 같다:
//   우편번호마다 (온도대 행 → 없으면 ALL 행) 센터를 구해, 모두 같은 센터면 그 센터 / 섞이거나 미배정이 있으면 확인 필요
//   A·B: 그 우편번호 / C: 그 법정동의 우편번호 전부 / D: 그 시군구의 우편번호 전부(우편번호만 확인된 경우 그 하나) / F: 확인 필요
// 운영사 자동 지정 등급(region_auto_grade, 기본 D)보다 낮으면 센터를 알려 주되 확인 필요

export type ResolveLevel = 'ZIP' | 'BJD' | 'SIGUNGU'

export type CenterResolution = {
  centerId: bigint | null
  centerName: string | null
  // 어떤 기준으로 정했는지 (납품처·주문에 저장해 추적): 우편번호·법정동·시군구 + 그 코드
  resolveLevel: ResolveLevel | null
  resolveKey: string | null
  needConfirm: boolean
  // 확인 필요 이유 (needConfirm일 때)
  reason: string | null
  // 정해졌지만 알릴 것 (시군구 추정·일시중지 센터·우편번호 불일치)
  warnings: string[]
  // 섞여 있을 때 후보 센터 (주소 수가 아니라 우편번호 수 많은 순)
  candidates: { centerId: bigint; centerName: string; zipCount: number }[]
}

type Scope = { level: ResolveLevel; key: string; zips: string[] }

// 범위 안 우편번호들의 배정 요약: 센터별 우편번호 수, 미배정 수
async function summarize(db: Db, operatorId: bigint, zips: string[], tempZone: string) {
  const rows = await db.regionCenterMap.findMany({
    where: {
      operatorId,
      zipCode: { in: zips },
      tempZone: { in: [...new Set([tempZone, TEMP_ZONE_ALL])] },
    },
    select: {
      zipCode: true,
      tempZone: true,
      center: { select: { id: true, name: true, status: true } },
    },
  })
  // 우편번호마다 온도대 행이 ALL보다 먼저
  const byZip = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const prev = byZip.get(row.zipCode)
    if (!prev || (prev.tempZone === TEMP_ZONE_ALL && row.tempZone !== TEMP_ZONE_ALL)) {
      byZip.set(row.zipCode, row)
    }
  }
  const centers = new Map<bigint, { id: bigint; name: string; status: string; zipCount: number }>()
  for (const { center } of byZip.values()) {
    const entry = centers.get(center.id) ?? { ...center, zipCount: 0 }
    entry.zipCount++
    centers.set(center.id, entry)
  }
  return {
    centers: [...centers.values()].sort((a, b) => b.zipCount - a.zipCount),
    unassigned: zips.length - byZip.size,
  }
}

// 등급별로 볼 우편번호 범위
async function scopeOf(db: Db, norm: NormResult): Promise<Scope | null> {
  if ((norm.grade === 'A' || norm.grade === 'B' || norm.grade === 'D') && norm.zipCode) {
    return { level: 'ZIP', key: norm.zipCode, zips: [norm.zipCode] }
  }
  if (norm.grade === 'C' && norm.bjdCode) {
    // 읍면동이면 그 아래 리까지 (우편번호↔법정동은 주소DB의 가장 아래 법정동으로 이어져 있다)
    const isEmd = norm.bjdCode.endsWith('00')
    const links = await db.regionZipBjd.findMany({
      where: {
        bjdCode: isEmd ? { startsWith: norm.bjdCode.slice(0, 8) } : norm.bjdCode,
        zip: { abolishedYn: 'N' },
      },
      select: { zipCode: true },
    })
    return { level: 'BJD', key: norm.bjdCode, zips: [...new Set(links.map((l) => l.zipCode))] }
  }
  if (norm.grade === 'D' && norm.sigunguCode) {
    const codes = sigunguScope(await getBjdIndex(db), norm.sigunguCode)
    const zips = await db.regionZip.findMany({
      where: { sigunguCode: { in: codes }, abolishedYn: 'N' },
      select: { code: true },
    })
    return { level: 'SIGUNGU', key: norm.sigunguCode, zips: zips.map((z) => z.code) }
  }
  return null
}

const LEVEL_LABEL: Record<ResolveLevel, string> = {
  ZIP: '우편번호',
  BJD: '법정동',
  SIGUNGU: '시군구',
}

// 범위 → 결과 (등급·자동 지정 등급 판단 전)
async function decide(db: Db, operatorId: bigint, scope: Scope, tempZone: string) {
  const none = {
    centerId: null,
    centerName: null,
    resolveLevel: scope.level,
    resolveKey: scope.key,
    warnings: [] as string[],
  }
  if (scope.zips.length === 0) {
    return {
      ...none,
      needConfirm: true,
      reason: `${LEVEL_LABEL[scope.level]}에 해당하는 우편번호가 없습니다.`,
      candidates: [],
    }
  }
  const { centers, unassigned } = await summarize(db, operatorId, scope.zips, tempZone)
  const candidates = centers.map((c) => ({
    centerId: c.id,
    centerName: c.name,
    zipCount: c.zipCount,
  }))
  if (centers.length === 0) {
    return {
      ...none,
      needConfirm: true,
      reason: '권역설정에 배정되지 않은 지역입니다.',
      candidates,
    }
  }
  if (centers.length > 1) {
    return {
      ...none,
      needConfirm: true,
      reason: `이 ${LEVEL_LABEL[scope.level]}의 우편번호가 여러 센터(${centers.map((c) => c.name).join(', ')})로 나뉘어 있습니다.`,
      candidates,
    }
  }
  if (unassigned > 0) {
    return {
      ...none,
      needConfirm: true,
      reason: `이 ${LEVEL_LABEL[scope.level]}에 배정되지 않은 우편번호가 ${unassigned}개 있습니다.`,
      candidates,
    }
  }
  const center = centers[0]
  const warnings: string[] = []
  if (center.status === 'SUSPENDED') warnings.push(`일시중지 센터입니다 (${center.name}).`)
  if (center.status === 'CLOSED') {
    return {
      ...none,
      needConfirm: true,
      reason: `배정된 센터가 폐쇄되었습니다 (${center.name}). 권역 재배정이 필요합니다.`,
      candidates,
    }
  }
  return {
    ...none,
    centerId: center.id,
    centerName: center.name,
    needConfirm: false,
    reason: null,
    warnings,
    candidates,
  }
}

// 주소 정제 결과 → 배송센터
export async function resolveCenterByAddress(
  db: Db,
  operatorId: bigint,
  norm: NormResult,
  tempZone: string = TEMP_ZONE_ALL,
): Promise<CenterResolution> {
  const scope = await scopeOf(db, norm)
  if (!scope) {
    return {
      centerId: null,
      centerName: null,
      resolveLevel: null,
      resolveKey: null,
      needConfirm: true,
      reason: '주소를 확인할 수 없습니다. 주소를 고치거나 배송센터를 직접 고르세요.',
      warnings: [],
      candidates: [],
    }
  }
  const result: CenterResolution = await decide(db, operatorId, scope, tempZone)
  if (norm.zipMismatch)
    result.warnings.push('입력한 우편번호가 주소와 다릅니다 (주소 기준으로 정했습니다).')
  if (result.centerId === null) return result

  if (norm.grade === 'D') {
    result.warnings.push(
      norm.zipCode
        ? '주소는 확인하지 못하고 우편번호로만 정했습니다. 확인을 권장합니다.'
        : '시군구까지만 확인된 주소입니다. 확인을 권장합니다.',
    )
  }
  const operator = await db.operator.findUnique({
    where: { id: operatorId },
    select: { regionAutoGrade: true },
  })
  const autoGrade = (operator?.regionAutoGrade ?? 'D') as AddrGrade
  if (!gradeAtLeast(norm.grade, autoGrade)) {
    result.needConfirm = true
    result.reason = `정제 등급 ${norm.grade}(${ADDR_GRADE.labels[norm.grade]})이 자동 지정 기준(${autoGrade} 이상)보다 낮습니다.`
  }
  return result
}

// 지역 기본 배송센터: 화면에서 배송센터를 직접 고를 때 미리 고를 값 (모두 같은 센터일 때만)
export async function getDefaultCenter(
  db: Db,
  operatorId: bigint,
  region: { zipCode?: string; bjdCode?: string; sigunguCode?: string },
  tempZone: string = TEMP_ZONE_ALL,
) {
  const norm = {
    grade: region.zipCode ? 'A' : region.bjdCode ? 'C' : 'D',
    zipCode: region.zipCode ?? null,
    bjdCode: region.bjdCode ?? null,
    sigunguCode: region.sigunguCode ?? null,
  } as NormResult
  const scope = await scopeOf(db, norm)
  if (!scope) return null
  const result = await decide(db, operatorId, scope, tempZone)
  return result.centerId ? { centerId: result.centerId, centerName: result.centerName! } : null
}
