import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import {
  buildPreview,
  requiredIssues,
  type UploadIssue,
  type UploadPreview,
  type UploadRow,
} from '@/lib/excel/upload'
import { prisma, type Db } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { SHIPPER_SETUP_ONLY } from '@/lib/shippers/shipper-codes'
import { SHIPPER_SCOPE } from './customer-list'
import { customerUploadTemplate } from './customer-upload-template'
import {
  itemErrorOf,
  partnerSchema,
  upsertPartner,
  type PartnerItem,
  type PartnerShipToItem,
} from './customer-upsert'

// 거래처 엑셀 업로드 (docs/decisions/0082 ③) — API upsert(upsertPartner)와 같은 서비스
// 검증: 파일 전체를 한 트랜잭션에서 실제로 처리해 본 뒤 되돌린다 (신규·수정·배송센터 결과까지 미리보기)
// 등록: 같은 처리를 다시 하고, 오류가 하나라도 있으면 아무것도 저장하지 않는다 (0049 공통 규칙)
// 등록 경로 UPLOAD, 화주 정책은 쓰지 않는다 (운영사가 올림 — 못 정한 배송센터는 "확인 필요"로 저장)

// 거래처 칸 (줄마다 반복, 다르면 오류)
const PARTNER_KEYS = [
  'partnerNm',
  'shortNm',
  'partnerType',
  'partnerGroup',
  'bizRegNo',
  'ceoNm',
  'telNo',
  'faxNo',
  'email',
  'zipCd',
  'addr1',
  'addr2',
  'minShelfDays',
  'status',
] as const
// 납품처 칸 (엑셀 제목 key → API 필드)
const SHIP_TO_KEYS = {
  shipToNm: 'shipToNm',
  shipToZipCd: 'zipCd',
  shipToAddr1: 'addr1',
  shipToAddr2: 'addr2',
  receiverNm: 'receiverNm',
  receiverTelNo: 'receiverTelNo',
  deliveryMemo: 'deliveryMemo',
  centerCd: 'centerCd',
} as const

const STATUS_OF: Record<string, string> = {
  거래중: 'ACTIVE',
  거래중지: 'SUSPENDED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
}
const SHIP_TO_STATUS_OF: Record<string, string> = {
  사용: 'ACTIVE',
  사용중지: 'INACTIVE',
  '사용 중지': 'INACTIVE',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
}
const YN: Record<string, boolean> = { Y: true, N: false, 예: true, 아니오: false }

type Group = { shipperId: bigint; rows: UploadRow[]; item?: PartnerItem }

// 파일 → 거래처 묶음 (형식 오류는 issues에)
async function groupRows(rows: UploadRow[], scope: DataScope) {
  const issues: UploadIssue[] = requiredIssues(customerUploadTemplate, rows)
  const add = (row: UploadRow, column: string | undefined, message: string) =>
    issues.push({ rowNo: row.rowNo, column, message })
  const shippers = await prisma.shipper.findMany({
    where: { AND: [scopeFilter(scope, SHIPPER_SCOPE), SHIPPER_SETUP_ONLY] },
    select: { id: true, code: true },
  })
  const shipperByCode = new Map(shippers.map((s) => [s.code.toUpperCase(), s.id]))

  const groups = new Map<string, Group>()
  for (const row of rows) {
    const shipperCode = (row.values.shipperCode ?? '').trim().toUpperCase()
    const partnerCd = (row.values.partnerCd ?? '').trim().toUpperCase()
    if (!shipperCode || !partnerCd) continue
    const shipperId = shipperByCode.get(shipperCode)
    if (!shipperId) {
      add(row, 'shipperCode', `없거나 거래처를 등록할 수 없는 화주사입니다 (${shipperCode}).`)
      continue
    }
    const key = `${shipperCode}|${partnerCd}`
    const group = groups.get(key) ?? { shipperId, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    const first = group.rows[0]
    const item: Record<string, unknown> = { partnerCd: first.values.partnerCd.trim() }
    // 거래처 칸: 넣은 값만 (줄마다 다르면 오류)
    for (const key of PARTNER_KEYS) {
      const values = [
        ...new Set(group.rows.map((r) => (r.values[key] ?? '').trim()).filter(Boolean)),
      ]
      if (values.length > 1) {
        add(
          group.rows.find((r) => (r.values[key] ?? '').trim() === values[1])!,
          key,
          '같은 거래처의 줄끼리 값이 다릅니다.',
        )
        continue
      }
      if (values.length === 0) continue
      const value = values[0]
      if (key === 'minShelfDays') {
        if (!/^\d+$/.test(value)) add(first, key, '숫자로 넣어 주세요.')
        else item.minShelfDays = Number(value)
      } else if (key === 'status') {
        if (!STATUS_OF[value]) add(first, key, '거래중 / 거래중지 중 하나입니다.')
        else item.status = STATUS_OF[value]
      } else item[key] = value
    }
    // 납품처: 납품처코드가 있는 줄마다
    const shipTos: PartnerShipToItem[] = []
    for (const row of group.rows) {
      const code = (row.values.shipToCd ?? '').trim()
      if (!code) continue
      const shipTo: Record<string, unknown> = { shipToCd: code }
      for (const [col, field] of Object.entries(SHIP_TO_KEYS)) {
        const value = (row.values[col] ?? '').trim()
        if (value) shipTo[field] = value
      }
      const yn = (row.values.shipToDefault ?? '').trim().toUpperCase()
      if (yn) {
        if (YN[yn] === undefined) add(row, 'shipToDefault', 'Y / N 중 하나입니다.')
        else shipTo.default = YN[yn]
      }
      const status = (row.values.shipToStatus ?? '').trim()
      if (status) {
        if (!SHIP_TO_STATUS_OF[status]) add(row, 'shipToStatus', '사용 / 사용중지 중 하나입니다.')
        else shipTo.status = SHIP_TO_STATUS_OF[status]
      }
      shipTos.push(shipTo as PartnerShipToItem)
    }
    if (shipTos.length > 0) item.shipTos = shipTos
    const parsed = partnerSchema.safeParse(item)
    if (!parsed.success) {
      add(first, undefined, parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.')
      continue
    }
    group.item = parsed.data
  }
  return { issues, groups: [...groups.values()] }
}

type RunSummary = {
  created: number
  updated: number
  unchanged: number
  assigned: number
  needConfirm: number
}

// 묶음들을 실제로 처리 (한 트랜잭션 안). 업무 오류는 그 거래처의 줄에 붙인다
async function runGroups(tx: Db, groups: Group[], issues: UploadIssue[]) {
  const summary: RunSummary = { created: 0, updated: 0, unchanged: 0, assigned: 0, needConfirm: 0 }
  for (const group of groups) {
    if (!group.item) continue
    try {
      const result = await upsertPartner(tx, group.item, {
        shipperId: group.shipperId,
        source: 'UPLOAD',
      })
      summary[
        result.result === 'CREATED'
          ? 'created'
          : result.result === 'UPDATED'
            ? 'updated'
            : 'unchanged'
      ]++
      for (const s of result.shipTos) {
        if (s.centerAssignStatus === 'ASSIGNED') summary.assigned++
        if (s.centerAssignStatus === 'NEED_CONFIRM') summary.needConfirm++
      }
    } catch (error) {
      const itemError = itemErrorOf(error)
      if (!itemError) throw error
      // 납품처 칸 오류면 그 납품처 줄에 (shipTos[i].…)
      const index = /^shipTos\[(\d+)\]/.exec(itemError.field ?? '')?.[1]
      const shipToRows = group.rows.filter((r) => (r.values.shipToCd ?? '').trim())
      const row = index !== undefined ? (shipToRows[Number(index)] ?? group.rows[0]) : group.rows[0]
      issues.push({ rowNo: row.rowNo, message: itemError.message })
    }
  }
  return summary
}

class Rollback extends Error {}

const summaryText = (s: RunSummary) =>
  `거래처 신규 ${s.created} · 수정 ${s.updated} · 변경 없음 ${s.unchanged} / 납품처 배송센터 지정 ${s.assigned} · 확인 필요 ${s.needConfirm}`

// 검증 (저장 안 함): 실제로 처리해 본 뒤 되돌린다
export async function previewCustomerUpload(
  rows: UploadRow[],
  scope: DataScope,
): Promise<UploadPreview> {
  const { issues, groups } = await groupRows(rows, scope)
  let summary: RunSummary | null = null
  try {
    await prisma.$transaction(
      async (tx) => {
        summary = await runGroups(tx, groups, issues)
        throw new Rollback()
      },
      { timeout: 120_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  const preview = buildPreview(customerUploadTemplate, rows, issues)
  return issues.length === 0 && summary
    ? { ...preview, summary: `${rows.length}행 모두 올바릅니다. ${summaryText(summary)}` }
    : preview
}

// 등록: 다시 처리하고, 오류가 하나라도 있으면 되돌린다
export async function commitCustomerUpload(rows: UploadRow[], scope: DataScope) {
  const { issues, groups } = await groupRows(rows, scope)
  if (issues.length > 0) {
    throw new ActionError(
      'VALIDATION',
      '오류가 있는 행이 있어 등록하지 않았습니다. 다시 확인해 주세요.',
    )
  }
  return prisma.$transaction(
    async (tx) => {
      const summary = await runGroups(tx, groups, issues)
      if (issues.length > 0) {
        throw new ActionError(
          'VALIDATION',
          '오류가 있는 행이 있어 등록하지 않았습니다. 다시 확인해 주세요.',
        )
      }
      return { message: `등록했습니다. ${summaryText(summary)}` }
    },
    { timeout: 120_000 },
  )
}
