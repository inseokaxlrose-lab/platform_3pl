'use server'

import { z } from 'zod'
import { TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { requireOperatorId } from '@/lib/actor'
import {
  buildPreview,
  requiredIssues,
  uploadRowsSchema,
  type UploadIssue,
  type UploadRow,
} from '@/lib/excel/upload'
import {
  reassignAfterRegionChange,
  shipToRegionImpact,
  type ReassignResult,
  type ShipToRegionImpact,
} from '@/lib/customers/ship-to-region'
import { idSchema, optionalIdSchema } from '@/lib/id'
import { prisma, type Db } from '@/lib/prisma'
import { normalizeAddress } from '@/lib/regions/address-normalize'
import { resolveCenterByAddress } from '@/lib/regions/center-resolve'
import {
  applyRegionChange,
  confirmSuggested,
  planRegionChange,
  type ChangeType,
  type RegionChangePlan,
} from '@/lib/regions/region-assign'
import { TEMP_ZONE_ALL } from '@/lib/regions/region-codes'
import {
  regionDashboard,
  regionNodeLabel,
  regionPathOfZip,
  regionTreeChildren,
  regionZipRows,
  regionZipRowsByCodes,
  zipsOfNode,
} from '@/lib/regions/region-queries'
import { REGION_UPLOAD_TEMPLATE } from './region-upload-template'

// 권역설정 서버 액션 (docs/decisions/0076)
// 조회 = master.regions.read, 지정·해제·추천 확인·엑셀 업로드 = master.regions.update, 엑셀 내려받기 = export
// 모든 저장은 미리보기(previewRegionAssignAction)와 같은 계산을 저장 때 다시 한다 (그 사이 바뀐 것도 반영)

const tempZoneSchema = z
  .string()
  .refine((v) => v === TEMP_ZONE_ALL || TEMP_ZONE.has(v), '온도대를 확인해 주세요.')
const zipSchema = z.string().regex(/^\d{5}$/, '우편번호는 5자리 숫자입니다.')
const nodeSchema = z.object({
  level: z.enum(['SIDO', 'SIGUNGU', 'EMD']),
  code: z.string().regex(/^(\d{2}|\d{5}|\d{8})$/),
})
const targetSchema = z.discriminatedUnion('kind', [
  // 트리 노드: 그 아래 우편번호 전부 (읍면동이면 경계 우편번호 포함 여부)
  z.object({ kind: z.literal('node'), node: nodeSchema, includeBoundary: z.boolean() }),
  // 표에서 고른 우편번호·붙여넣기
  z.object({
    kind: z.literal('zips'),
    source: z.enum(['GRID', 'PASTE']),
    zips: z.array(zipSchema).min(1).max(40000),
  }),
])
const assignSchema = z.object({
  target: targetSchema,
  tempZone: tempZoneSchema,
  // 비우면 배정 해제
  centerId: optionalIdSchema,
  reason: z.string().trim().max(500).optional(),
})
type AssignInput = z.output<typeof assignSchema>

const tempLabel = (tempZone: string) =>
  tempZone === TEMP_ZONE_ALL ? '' : ` [${TEMP_ZONE.labels[tempZone as TempZoneKey]}]`

// 지정 대상 → 우편번호·작업 유형·범위 설명
async function resolveTarget(db: Db, input: AssignInput) {
  const center = input.centerId
    ? await db.center.findFirst({ where: { id: input.centerId }, select: { name: true } })
    : null
  const to = center ? center.name : '배정 해제'
  if (input.target.kind === 'node') {
    const { zips, boundary } = await zipsOfNode(db, input.target.node)
    const label = await regionNodeLabel(db, input.target.node)
    const included = input.target.includeBoundary ? boundary : []
    return {
      zips: [...zips, ...included],
      boundary: { count: boundary.length, included: input.target.includeBoundary },
      changeType: (input.centerId ? 'TREE_ASSIGN' : 'UNASSIGN') as ChangeType,
      scopeDesc: `${label}${boundary.length ? (input.target.includeBoundary ? ` (경계 ${boundary.length}건 포함)` : ` (경계 ${boundary.length}건 제외)`) : ''} → ${to}${tempLabel(input.tempZone)}`,
    }
  }
  const zips = [...new Set(input.target.zips)]
  const sample = zips.slice(0, 3).join(', ')
  return {
    zips,
    boundary: null,
    changeType: (input.centerId
      ? input.target.source === 'PASTE'
        ? 'PASTE'
        : 'GRID_ASSIGN'
      : 'UNASSIGN') as ChangeType,
    scopeDesc: `우편번호 ${zips.length}건 (${sample}${zips.length > 3 ? ' 외' : ''}) → ${to}${tempLabel(input.tempZone)}`,
  }
}

// 미리보기 화면에 보낼 것 (전체 변경 목록 대신 요약 + 앞부분)
const previewOf = (plan: RegionChangePlan) => ({
  summary: plan.summary,
  changeCount: plan.changes.length,
  unchanged: plan.unchanged,
  invalid: plan.invalid.slice(0, 100),
  invalidCount: plan.invalid.length,
  sample: plan.changes.slice(0, 100).map((c) => ({
    zipCode: c.zipCode,
    before: c.before?.name ?? null,
    after: c.after?.name ?? null,
    confirmOnly: c.confirmOnly,
  })),
})

// 센터가 바뀐 우편번호 (추천 확인처럼 같은 센터면 납품처에 영향 없음)
const movedZips = (plan: RegionChangePlan) =>
  plan.changes.filter((c) => !c.confirmOnly).map((c) => c.zipCode)

// 납품처 영향 글 (미리보기·업로드 검증 요약에 붙인다, 0082)
function shipToImpactText(impact: ShipToRegionImpact) {
  const parts = [
    impact.autoChange > 0 && `자동 지정 납품처 ${impact.autoChange}곳 센터 변경`,
    impact.manualMismatch > 0 &&
      `수동·연동 지정 납품처 ${impact.manualMismatch}곳 권역 불일치 발생`,
    impact.needConfirmRetry > 0 && `확인 필요 납품처 ${impact.needConfirmRetry}곳 다시 지정`,
    impact.estimated > 0 && `법정동·시군구 추정 납품처 ${impact.estimated}곳 다시 계산`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

// 저장 결과 글: '납품처 n곳을 다시 정했습니다 (지정 a · 확인 필요 b)'
const reassignText = (result: ReassignResult | null) =>
  result && result.total > 0
    ? ` 납품처 ${result.total}곳을 다시 정했습니다 (센터·상태 변경 ${result.changed} · 확인 필요 ${result.needConfirm}).`
    : ''

// ── 조회 ──

export const getRegionDashboardAction = createAction({
  permission: 'master.regions.read',
  input: z.object({}),
  handler: async () => regionDashboard(prisma, requireOperatorId()),
})

export const getRegionTreeAction = createAction({
  permission: 'master.regions.read',
  input: z.object({ parent: nodeSchema.nullable(), tempZone: tempZoneSchema }),
  handler: async ({ input }) =>
    regionTreeChildren(prisma, requireOperatorId(), input.parent, input.tempZone),
})

export const getRegionZipsAction = createAction({
  permission: 'master.regions.read',
  input: z.object({ node: nodeSchema, tempZone: tempZoneSchema }),
  handler: async ({ input }) =>
    regionZipRows(prisma, requireOperatorId(), input.node, input.tempZone),
})

// 배정할 수 있는 센터 (준비중·운영중) + 취급 온도대
export const getAssignableCentersAction = createAction({
  permission: 'master.regions.read',
  input: z.object({}),
  handler: async () =>
    prisma.center.findMany({
      where: { operatorId: requireOperatorId(), status: { in: ['ACTIVE', 'PREPARING'] } },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        tempZones: { select: { tempZoneCd: true } },
      },
    }),
})

// 주소로 찾기: 정제 → 우편번호(없으면 법정동·시군구)의 트리 위치
export const findRegionByAddressAction = createAction({
  permission: 'master.regions.read',
  input: z.object({ address: z.string().trim().min(2).max(300), tempZone: tempZoneSchema }),
  handler: async ({ input }) => {
    const norm = await normalizeAddress(prisma, { address: input.address })
    const zipCode = norm.zipCode
    const path = zipCode
      ? await regionPathOfZip(prisma, zipCode)
      : norm.bjdCode
        ? {
            sidoCode: norm.bjdCode.slice(0, 2),
            sigunguCode: norm.bjdCode.slice(0, 5),
            emdCode: norm.bjdCode.slice(0, 8),
          }
        : norm.sigunguCode
          ? { sidoCode: norm.sigunguCode.slice(0, 2), sigunguCode: norm.sigunguCode, emdCode: null }
          : null
    const rows = zipCode
      ? await regionZipRowsByCodes(prisma, requireOperatorId(), [zipCode], input.tempZone)
      : []
    return {
      grade: norm.grade,
      zipCode,
      path,
      row: rows[0] ?? null,
      apiUnavailable: norm.apiUnavailable,
    }
  },
})

// 권역 시뮬레이터: 주소·우편번호 → 정제 결과 + 결정된 센터
export const simulateRegionAction = createAction({
  permission: 'master.regions.read',
  input: z.object({
    address: z.string().trim().max(300),
    zipCode: z.string().trim().max(10).optional(),
    tempZone: tempZoneSchema,
  }),
  handler: async ({ input }) => {
    if (!input.address && !input.zipCode) {
      throw new ActionError('VALIDATION', '주소나 우편번호를 넣어 주세요.')
    }
    const norm = await normalizeAddress(prisma, { address: input.address, zipCode: input.zipCode })
    const resolution = await resolveCenterByAddress(
      prisma,
      requireOperatorId(),
      norm,
      input.tempZone,
    )
    return { norm, resolution }
  },
})

// 변경 이력: 작업 단위 목록 (최근 500건)
export const listRegionBatchesAction = createAction({
  permission: 'master.regions.read',
  input: z.object({}),
  handler: async () =>
    prisma.regionChangeBatch.findMany({
      where: { operatorId: requireOperatorId() },
      orderBy: { id: 'desc' },
      take: 500,
      select: {
        id: true,
        changeType: true,
        scopeDesc: true,
        tempZone: true,
        changedCount: true,
        reason: true,
        createdAt: true,
        createdBy: true,
        targetCenter: { select: { name: true } },
      },
    }),
})

// 작업 하나의 우편번호별 변경 내역
export const getRegionBatchDetailAction = createAction({
  permission: 'master.regions.read',
  input: z.object({ batchId: idSchema }),
  handler: async ({ input }) => {
    const hists = await prisma.regionCenterMapHist.findMany({
      where: { operatorId: requireOperatorId(), batchId: input.batchId },
      orderBy: { zipCode: 'asc' },
      take: 5000,
      select: {
        id: true,
        zipCode: true,
        tempZone: true,
        beforeCenterId: true,
        afterCenterId: true,
      },
    })
    const ids = [
      ...new Set(
        hists.flatMap((h) => [h.beforeCenterId, h.afterCenterId]).filter((v) => v !== null),
      ),
    ]
    const names = new Map(
      (
        await prisma.center.findMany({
          where: { id: { in: ids as bigint[] } },
          select: { id: true, name: true },
        })
      ).map((c) => [c.id, c.name]),
    )
    return hists.map((h) => ({
      id: h.id,
      zipCode: h.zipCode,
      tempZone: h.tempZone,
      before: h.beforeCenterId ? (names.get(h.beforeCenterId) ?? '') : null,
      after: h.afterCenterId ? (names.get(h.afterCenterId) ?? '') : null,
    }))
  },
})

// 엑셀 내려받기: 지금 배정표 전체
export const exportRegionMapAction = createAction({
  permission: 'master.regions.export',
  input: z.object({}),
  handler: async () => {
    type Row = {
      zip_cd: string
      sido_nm: string | null
      sigungu_nm: string | null
      bjd_names: string | null
      rep_addr: string | null
      abolished_yn: string
      temp_zone_cd: string
      center_cd: string
      center_nm: string
      assign_type_cd: string
      confirm_yn: string
    }
    const operatorId = requireOperatorId()
    return prisma.$queryRaw<Row[]>`
      SELECT m.zip_cd, sg.sido_nm, NULLIF(sg.sigungu_nm, '') AS sigungu_nm,
        (SELECT string_agg(DISTINCT concat_ws(' ', b.emd_nm, b.ri_nm), ', ')
           FROM tb_region_zip_bjd zb JOIN tb_region_bjd b ON b.bjd_cd = zb.bjd_cd WHERE zb.zip_cd = m.zip_cd) AS bjd_names,
        z.rep_addr, z.abolished_yn, m.temp_zone_cd, c.center_cd, c.center_nm, m.assign_type_cd, m.confirm_yn
      FROM tb_region_center_map m
      JOIN tb_region_zip z ON z.zip_cd = m.zip_cd
      JOIN tb_center c ON c.center_id = m.center_id
      LEFT JOIN LATERAL (
        SELECT sido_nm, sigungu_nm FROM tb_region_bjd WHERE sigungu_cd = z.sigungu_cd ORDER BY abolished_yn, bjd_level LIMIT 1
      ) sg ON true
      WHERE m.operator_id = ${operatorId}
      ORDER BY m.zip_cd, m.temp_zone_cd`
  },
})

// ── 저장 ──

export const previewRegionAssignAction = createAction({
  permission: 'master.regions.update',
  input: assignSchema,
  handler: async ({ input }) => {
    const target = await resolveTarget(prisma, input)
    const plan = await planRegionChange(prisma, requireOperatorId(), {
      zips: target.zips,
      tempZone: input.tempZone,
      centerId: input.centerId,
    })
    const impact = await shipToRegionImpact(
      prisma,
      requireOperatorId(),
      input.tempZone,
      plan.changes,
    )
    return {
      ...previewOf(plan),
      boundary: target.boundary,
      scopeDesc: target.scopeDesc,
      shipToImpact: shipToImpactText(impact),
    }
  },
})

export const applyRegionAssignAction = createAction({
  permission: 'master.regions.update',
  input: assignSchema,
  handler: async ({ input }) =>
    prisma.$transaction(
      async (tx) => {
        const target = await resolveTarget(tx, input)
        const { batchId, plan } = await applyRegionChange(tx, requireOperatorId(), {
          zips: target.zips,
          tempZone: input.tempZone,
          centerId: input.centerId,
          changeType: target.changeType,
          scopeDesc: target.scopeDesc,
          reason: input.reason,
        })
        // 바뀐 우편번호의 납품처 배송센터를 바로 다시 정한다 (같은 트랜잭션 — 0082 ②)
        const reassigned = await reassignAfterRegionChange(
          tx,
          requireOperatorId(),
          input.tempZone,
          movedZips(plan),
        )
        return {
          batchId,
          changeCount: plan.changes.length,
          invalidCount: plan.invalid.length,
          shipToNotice: reassignText(reassigned),
        }
      },
      { timeout: 60_000 },
    ),
})

export const confirmSuggestedAction = createAction({
  permission: 'master.regions.update',
  input: z.object({ zips: z.array(zipSchema).min(1).max(40000), tempZone: tempZoneSchema }),
  handler: async ({ input }) =>
    prisma.$transaction((tx) => confirmSuggested(tx, requireOperatorId(), input)),
})

// ── 엑셀 업로드: 우편번호 + 온도대 + 센터코드 (센터코드를 비우면 배정 해제) ──
// 센터·온도대별로 묶어 작업 단위를 만든다. 검증 미리보기의 요약에 '수원 → 이천 n건'을 보여 준다

type UploadPlan = { tempZone: string; centerId: bigint | null; zips: string[] }

async function checkUpload(db: Db, rows: UploadRow[]) {
  const operatorId = requireOperatorId()
  const issues: UploadIssue[] = requiredIssues(REGION_UPLOAD_TEMPLATE, rows)
  const centers = new Map(
    (
      await db.center.findMany({
        where: { operatorId },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          tempZones: { select: { tempZoneCd: true } },
        },
      })
    ).map((c) => [c.code.toUpperCase(), c]),
  )
  const tempByLabel = new Map<string, string>([
    ['', TEMP_ZONE_ALL],
    [TEMP_ZONE_ALL, TEMP_ZONE_ALL],
    ['전체', TEMP_ZONE_ALL],
    ...TEMP_ZONE.options.flatMap((o) => [
      [o.value, o.value] as [string, string],
      [o.label, o.value] as [string, string],
    ]),
  ])
  const groups = new Map<string, UploadPlan>()
  const seen = new Map<string, number>()
  for (const row of rows) {
    const zip = (row.values.zipCode ?? '').replace(/\D/g, '')
    const tempZone =
      tempByLabel.get((row.values.tempZone ?? '').trim().toUpperCase()) ??
      tempByLabel.get((row.values.tempZone ?? '').trim())
    const code = (row.values.centerCode ?? '').trim().toUpperCase()
    const center = code ? centers.get(code) : null
    const rowIssues: string[] = []
    if (!/^\d{5}$/.test(zip)) rowIssues.push('우편번호는 5자리 숫자입니다.')
    if (!tempZone) rowIssues.push('온도대는 비우거나(전체) 상온·냉장·냉동·항온 중 하나입니다.')
    if (code && !center) rowIssues.push(`없는 센터코드입니다 (${code}).`)
    if (center && center.status !== 'ACTIVE' && center.status !== 'PREPARING') {
      rowIssues.push(`준비중·운영중 센터에만 배정할 수 있습니다 (${center.name}).`)
    }
    if (
      center &&
      tempZone &&
      tempZone !== TEMP_ZONE_ALL &&
      !center.tempZones.some((z) => z.tempZoneCd === tempZone)
    ) {
      rowIssues.push(`${center.name}은(는) 이 온도대를 취급하지 않습니다.`)
    }
    const key = `${zip}|${tempZone}`
    if (seen.has(key)) rowIssues.push(`${seen.get(key)}행과 우편번호·온도대가 겹칩니다.`)
    else seen.set(key, row.rowNo)
    if (rowIssues.length > 0) {
      issues.push(...rowIssues.map((message) => ({ rowNo: row.rowNo, message })))
      continue
    }
    const groupKey = `${tempZone}|${center?.id ?? ''}`
    const group = groups.get(groupKey) ?? {
      tempZone: tempZone!,
      centerId: center?.id ?? null,
      zips: [],
    }
    group.zips.push(zip)
    groups.set(groupKey, group)
  }
  // 지역 마스터에 없거나 폐지된 우편번호 → 그 행 오류
  const plans: { group: UploadPlan; plan: RegionChangePlan }[] = []
  for (const group of groups.values()) {
    const plan = await planRegionChange(db, operatorId, group)
    for (const bad of plan.invalid) {
      const row = rows.find((r) => (r.values.zipCode ?? '').replace(/\D/g, '') === bad.zipCode)
      if (row) issues.push({ rowNo: row.rowNo, message: `${bad.reason} (${bad.zipCode})` })
    }
    plans.push({ group, plan })
  }
  const summary = plans
    .flatMap(({ group, plan }) =>
      plan.summary.map(
        (s) =>
          `${s.from ?? '미배정'} → ${s.to ?? '배정 해제'}${tempLabel(group.tempZone)} ${s.count}건`,
      ),
    )
    .join(', ')
  const impact = await shipToRegionImpact(
    db,
    operatorId,
    TEMP_ZONE_ALL,
    plans
      .filter(({ group }) => group.tempZone === TEMP_ZONE_ALL)
      .flatMap(({ plan }) => plan.changes),
  )
  const impactText = shipToImpactText(impact)
  return {
    issues,
    plans,
    summary: `${summary || '바뀌는 배정이 없습니다.'}${impactText ? ` / ${impactText}` : ''}`,
  }
}

export const validateRegionUploadAction = createAction({
  permission: 'master.regions.update',
  input: uploadRowsSchema,
  handler: async ({ input }) => {
    const { issues, summary } = await checkUpload(prisma, input)
    return buildPreview(REGION_UPLOAD_TEMPLATE, input, issues, summary)
  },
})

export const commitRegionUploadAction = createAction({
  permission: 'master.regions.update',
  input: uploadRowsSchema,
  handler: async ({ input }) =>
    prisma.$transaction(
      async (tx) => {
        const { issues, plans } = await checkUpload(tx, input)
        if (issues.length > 0) {
          throw new ActionError(
            'VALIDATION',
            '오류가 있는 행이 있어 반영하지 않았습니다. 다시 확인해 주세요.',
          )
        }
        let changed = 0
        const moved: string[] = []
        for (const { group, plan } of plans) {
          if (plan.changes.length === 0) continue
          const center = group.centerId
            ? await tx.center.findUnique({ where: { id: group.centerId }, select: { name: true } })
            : null
          const result = await applyRegionChange(tx, requireOperatorId(), {
            ...group,
            changeType: group.centerId ? 'UPLOAD' : 'UNASSIGN',
            assignType: 'UPLOAD',
            scopeDesc: `엑셀 업로드 우편번호 ${group.zips.length}건 → ${center?.name ?? '배정 해제'}${tempLabel(group.tempZone)}`,
          })
          changed += result.plan.changes.length
          if (group.tempZone === TEMP_ZONE_ALL) moved.push(...movedZips(result.plan))
        }
        const reassigned = await reassignAfterRegionChange(
          tx,
          requireOperatorId(),
          TEMP_ZONE_ALL,
          moved,
        )
        return { message: `배정 ${changed}건을 반영했습니다.${reassignText(reassigned)}` }
      },
      { timeout: 60_000 },
    ),
})
