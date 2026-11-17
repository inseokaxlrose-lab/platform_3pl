import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { Db } from '@/lib/prisma'
import { TEMP_ZONE_ALL } from './region-codes'

// 권역설정 화면 조회 (docs/decisions/0076)
// 지역 트리: 시도 → 시군구 → 읍면동. 노드마다 그 아래 우편번호(폐지 제외)의 배정 상태
//   - 시도·시군구: 우편번호의 시군구(주소가 가장 많은 곳) 기준
//   - 읍면동: 우편번호↔법정동 기준 (경계 우편번호는 걸친 읍면동마다 보인다)
// 온도대를 고르면 (그 온도대 행 → 없으면 ALL 행)이 그 우편번호의 센터

export type RegionLevel = 'SIDO' | 'SIGUNGU' | 'EMD'
export type RegionNodeRef = { level: RegionLevel; code: string }

export type RegionNode = RegionNodeRef & {
  name: string
  zipCount: number
  unassigned: number
  unconfirmed: number
  centers: { centerId: bigint; name: string; count: number }[]
}

// 읍면동 노드 코드 = 법정동코드 앞 8자리 (SQL에는 글자 그대로 넣는다: 매개변수면 DISTINCT ON·ORDER BY가 다른 식이 됨)
const EMD_LEN = 8
const EMD = Prisma.raw(String(EMD_LEN))

// 노드 아래 우편번호 (폐지 제외) → SQL 조각 (zip_cd, k=자식 노드 키)
function childZips(parent: RegionNodeRef | null) {
  if (!parent) {
    return Prisma.sql`SELECT z.zip_cd, z.sido_cd AS k FROM tb_region_zip z WHERE z.abolished_yn = 'N'`
  }
  if (parent.level === 'SIDO') {
    return Prisma.sql`SELECT z.zip_cd, z.sigungu_cd AS k FROM tb_region_zip z
      WHERE z.abolished_yn = 'N' AND z.sido_cd = ${parent.code}`
  }
  return Prisma.sql`SELECT DISTINCT zb.zip_cd, substr(zb.bjd_cd, 1, ${EMD}) AS k
    FROM tb_region_zip_bjd zb JOIN tb_region_zip z ON z.zip_cd = zb.zip_cd
    WHERE z.abolished_yn = 'N' AND zb.bjd_cd LIKE ${`${parent.code}%`}`
}

// 우편번호 → 실제 센터 (온도대 행 → ALL 행)
const effective = (operatorId: bigint, tempZone: string) => Prisma.sql`
  LEFT JOIN tb_region_center_map a
    ON a.operator_id = ${operatorId} AND a.zip_cd = s.zip_cd AND a.temp_zone_cd = ${TEMP_ZONE_ALL}
  LEFT JOIN tb_region_center_map t
    ON ${tempZone} <> ${TEMP_ZONE_ALL} AND t.operator_id = ${operatorId} AND t.zip_cd = s.zip_cd AND t.temp_zone_cd = ${tempZone}`

async function childNames(db: Db, parent: RegionNodeRef | null) {
  type Row = { k: string; name: string }
  let rows: Row[]
  if (!parent) {
    rows = await db.$queryRaw<Row[]>`
      SELECT DISTINCT ON (sido_cd) sido_cd AS k, sido_nm AS name FROM tb_region_bjd
      WHERE abolished_yn = 'N' ORDER BY sido_cd, bjd_level`
  } else if (parent.level === 'SIDO') {
    rows = await db.$queryRaw<Row[]>`
      SELECT sigungu_cd AS k, COALESCE(NULLIF(sigungu_nm, ''), sido_nm) AS name FROM tb_region_bjd
      WHERE abolished_yn = 'N' AND bjd_level = 2 AND sido_cd = ${parent.code}`
  } else {
    rows = await db.$queryRaw<Row[]>`
      SELECT DISTINCT ON (substr(bjd_cd, 1, ${EMD})) substr(bjd_cd, 1, ${EMD}) AS k, emd_nm AS name
      FROM tb_region_bjd WHERE sigungu_cd = ${parent.code} AND bjd_level >= 3 AND emd_nm IS NOT NULL
      ORDER BY substr(bjd_cd, 1, ${EMD}), abolished_yn, bjd_level`
  }
  return new Map(rows.map((r) => [r.k, r.name]))
}

const CHILD_LEVEL: Record<string, RegionLevel> = { ROOT: 'SIDO', SIDO: 'SIGUNGU', SIGUNGU: 'EMD' }

// 트리 한 단계 (부모 아래 자식 노드들, 가나다순)
export async function regionTreeChildren(
  db: Db,
  operatorId: bigint,
  parent: RegionNodeRef | null,
  tempZone: string,
): Promise<RegionNode[]> {
  type Row = {
    k: string
    center_id: bigint | null
    center_nm: string | null
    cnt: bigint
    unconfirmed: bigint
  }
  const rows = await db.$queryRaw<Row[]>`
    WITH s AS (${childZips(parent)})
    SELECT s.k, c.center_id, c.center_nm, count(*) AS cnt,
      count(*) FILTER (WHERE COALESCE(t.confirm_yn, a.confirm_yn) = 'N') AS unconfirmed
    FROM s ${effective(operatorId, tempZone)}
    LEFT JOIN tb_center c ON c.center_id = COALESCE(t.center_id, a.center_id)
    GROUP BY s.k, c.center_id, c.center_nm`
  const names = await childNames(db, parent)
  const level = CHILD_LEVEL[parent?.level ?? 'ROOT']
  const nodes = new Map<string, RegionNode>()
  for (const row of rows) {
    const node = nodes.get(row.k) ?? {
      level,
      code: row.k,
      name: names.get(row.k) ?? row.k,
      zipCount: 0,
      unassigned: 0,
      unconfirmed: 0,
      centers: [],
    }
    const count = Number(row.cnt)
    node.zipCount += count
    node.unconfirmed += Number(row.unconfirmed)
    if (row.center_id === null) node.unassigned += count
    else node.centers.push({ centerId: row.center_id, name: row.center_nm ?? '', count })
    nodes.set(row.k, node)
  }
  return [...nodes.values()]
    .map((n) => ({ ...n, centers: n.centers.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export type RegionZipRow = {
  zipCode: string
  bjdNames: string // '권선동, 호매실동'
  emdCount: number // 2 이상이면 경계 우편번호
  repAddress: string | null
  addressCount: number | null
  abolished: boolean
  centerId: bigint | null
  centerName: string | null
  centerStatus: string | null
  // 온도대를 골랐을 때: 그 온도대 행이 없어 ALL 배정을 따르는 중
  inherited: boolean
  assignType: string | null
  confirmed: boolean | null
  updatedAt: Date | null
  updatedBy: string | null
}

// 노드 아래 우편번호 목록 (폐지 포함 — 배정이 남은 폐지 우편번호를 정리할 수 있게)
export async function regionZipRows(
  db: Db,
  operatorId: bigint,
  node: RegionNodeRef,
  tempZone: string,
): Promise<RegionZipRow[]> {
  const where =
    node.level === 'SIDO'
      ? Prisma.sql`z.sido_cd = ${node.code}`
      : node.level === 'SIGUNGU'
        ? Prisma.sql`z.sigungu_cd = ${node.code}`
        : Prisma.sql`z.zip_cd IN (SELECT zip_cd FROM tb_region_zip_bjd WHERE bjd_cd LIKE ${`${node.code}%`})`
  return zipRows(db, operatorId, where, tempZone)
}

// 우편번호 목록으로 (주소로 찾기·붙여넣기 확인용)
export async function regionZipRowsByCodes(
  db: Db,
  operatorId: bigint,
  zips: string[],
  tempZone: string,
) {
  if (zips.length === 0) return []
  return zipRows(db, operatorId, Prisma.sql`z.zip_cd = ANY(${zips}::char(5)[])`, tempZone)
}

async function zipRows(db: Db, operatorId: bigint, where: Prisma.Sql, tempZone: string) {
  type Row = {
    zip_cd: string
    bjd_names: string | null
    emd_cnt: bigint
    rep_addr: string | null
    addr_cnt: number | null
    abolished_yn: string
    center_id: bigint | null
    center_nm: string | null
    status_cd: string | null
    own: boolean
    assign_type_cd: string | null
    confirm_yn: string | null
    updated_at: Date | null
    updated_by: string | null
  }
  const rows = await db.$queryRaw<Row[]>`
    WITH s AS (SELECT z.* FROM tb_region_zip z WHERE ${where})
    SELECT s.zip_cd, s.rep_addr, s.addr_cnt, s.abolished_yn,
      (SELECT string_agg(DISTINCT concat_ws(' ', b.emd_nm, b.ri_nm), ', ')
         FROM tb_region_zip_bjd zb JOIN tb_region_bjd b ON b.bjd_cd = zb.bjd_cd WHERE zb.zip_cd = s.zip_cd) AS bjd_names,
      (SELECT count(DISTINCT substr(zb.bjd_cd, 1, ${EMD})) FROM tb_region_zip_bjd zb WHERE zb.zip_cd = s.zip_cd) AS emd_cnt,
      c.center_id, c.center_nm, c.status_cd, (t.map_id IS NOT NULL) AS own,
      COALESCE(t.assign_type_cd, a.assign_type_cd) AS assign_type_cd,
      COALESCE(t.confirm_yn, a.confirm_yn) AS confirm_yn,
      COALESCE(t.updated_at, a.updated_at) AS updated_at,
      COALESCE(t.updated_by, a.updated_by) AS updated_by
    FROM s ${effective(operatorId, tempZone)}
    LEFT JOIN tb_center c ON c.center_id = COALESCE(t.center_id, a.center_id)
    ORDER BY s.zip_cd`
  return rows.map<RegionZipRow>((r) => ({
    zipCode: r.zip_cd,
    bjdNames: r.bjd_names ?? '',
    emdCount: Number(r.emd_cnt),
    repAddress: r.rep_addr,
    addressCount: r.addr_cnt,
    abolished: r.abolished_yn === 'Y',
    centerId: r.center_id,
    centerName: r.center_nm,
    centerStatus: r.status_cd,
    inherited: tempZone !== TEMP_ZONE_ALL && !r.own && r.center_id !== null,
    assignType: r.assign_type_cd,
    confirmed: r.confirm_yn === null ? null : r.confirm_yn === 'Y',
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }))
}

// 노드 → 지정 대상 우편번호 (폐지 제외). 읍면동이면 경계 우편번호(다른 읍면동에도 걸친 것)를 따로
export async function zipsOfNode(db: Db, node: RegionNodeRef) {
  type Row = { zip_cd: string; boundary: boolean }
  const where =
    node.level === 'SIDO'
      ? Prisma.sql`z.sido_cd = ${node.code}`
      : node.level === 'SIGUNGU'
        ? Prisma.sql`z.sigungu_cd = ${node.code}`
        : Prisma.sql`z.zip_cd IN (SELECT zip_cd FROM tb_region_zip_bjd WHERE bjd_cd LIKE ${`${node.code}%`})`
  const rows = await db.$queryRaw<Row[]>`
    SELECT z.zip_cd, ${node.level === 'EMD'}::boolean AND EXISTS (
      SELECT 1 FROM tb_region_zip_bjd zb WHERE zb.zip_cd = z.zip_cd AND zb.bjd_cd NOT LIKE ${`${node.code}%`}
    ) AS boundary
    FROM tb_region_zip z WHERE z.abolished_yn = 'N' AND ${where} ORDER BY z.zip_cd`
  return {
    zips: rows.filter((r) => !r.boundary).map((r) => r.zip_cd),
    boundary: rows.filter((r) => r.boundary).map((r) => r.zip_cd),
  }
}

// 노드 이름 전체 ('경기도 수원시 권선구 호매실동') — 작업 범위 설명용
export async function regionNodeLabel(db: Db, node: RegionNodeRef) {
  type Row = { sido_nm: string; sigungu_nm: string; emd_nm: string | null }
  const [row] = await db.$queryRaw<Row[]>`
    SELECT sido_nm, sigungu_nm, emd_nm FROM tb_region_bjd
    WHERE bjd_cd LIKE ${`${node.code}%`} ORDER BY abolished_yn, bjd_level LIMIT 1`
  if (!row) return node.code
  if (node.level === 'SIDO') return row.sido_nm
  if (node.level === 'SIGUNGU') return [row.sido_nm, row.sigungu_nm].filter(Boolean).join(' ')
  return [row.sido_nm, row.sigungu_nm, row.emd_nm].filter(Boolean).join(' ')
}

// 우편번호 → 트리 위치 (주소로 찾기): 시도·시군구·주소가 가장 많은 읍면동
export async function regionPathOfZip(db: Db, zipCode: string) {
  const zip = await db.regionZip.findUnique({
    where: { code: zipCode },
    select: {
      sidoCode: true,
      sigunguCode: true,
      bjds: { select: { bjdCode: true, addressCount: true } },
    },
  })
  if (!zip) return null
  const main = [...zip.bjds].sort((a, b) => (b.addressCount ?? 0) - (a.addressCount ?? 0))[0]
  return {
    sidoCode: zip.sidoCode,
    sigunguCode: zip.sigunguCode,
    emdCode: main ? main.bjdCode.slice(0, EMD_LEN) : null,
  }
}

// 화면 위 요약
export async function regionDashboard(db: Db, operatorId: bigint) {
  type Row = { center_id: bigint; center_nm: string; status_cd: string; cnt: bigint }
  const [total, perCenter, unconfirmed, abolishedAssigned, lastLoad] = await Promise.all([
    db.regionZip.count({ where: { abolishedYn: 'N' } }),
    db.$queryRaw<Row[]>`
      SELECT c.center_id, c.center_nm, c.status_cd, count(*) AS cnt
      FROM tb_region_center_map m JOIN tb_region_zip z ON z.zip_cd = m.zip_cd AND z.abolished_yn = 'N'
      JOIN tb_center c ON c.center_id = m.center_id
      WHERE m.operator_id = ${operatorId} AND m.temp_zone_cd = ${TEMP_ZONE_ALL}
      GROUP BY c.center_id, c.center_nm, c.status_cd ORDER BY cnt DESC`,
    db.regionCenterMap.count({ where: { operatorId, confirmYn: 'N' } }),
    db.regionCenterMap.count({ where: { operatorId, zip: { abolishedYn: 'Y' } } }),
    db.regionLoadHist.findFirst({
      where: { status: 'DONE' },
      orderBy: { id: 'desc' },
      select: { loadVer: true, endedAt: true, newCount: true, abolishedCount: true },
    }),
  ])
  const centers = perCenter.map((c) => ({
    centerId: c.center_id,
    name: c.center_nm,
    status: c.status_cd,
    count: Number(c.cnt),
  }))
  const assigned = centers.reduce((sum, c) => sum + c.count, 0)
  return {
    totalZips: total,
    assigned,
    unassigned: total - assigned,
    unconfirmed,
    abolishedAssigned,
    centers,
    lastLoad,
  }
}
