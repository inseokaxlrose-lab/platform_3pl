import 'server-only'
import { requireOperatorId } from '@/lib/actor'
import { resolveUnitDecimals } from '@/lib/units/unit-status'
import { ActionError } from '@/lib/actions/action-error'
import {
  buildPreview,
  requiredIssues,
  type UploadIssue,
  type UploadPreview,
  type UploadRow,
} from '@/lib/excel/upload'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { ACTIVE_ONLY } from '@/lib/status'
import { asnUploadTemplate } from './asn-upload-template'
import { asnLineSchema, type AsnCreateData } from './asn-schema'
import { asnItemSelect, createAsnInTx, resolveAsnLine } from './asns'

// ASN 엑셀 업로드 검증·등록 (docs/decisions/0050)
// 검증: 행마다 문제를 모은다 (저장 안 함). 등록: 다시 검증하고, 문제가 없을 때만 모든 ASN을 한 트랜잭션으로 만든다

const SHIPPER_SCOPE = { center: 'centers.some.centerId', shipper: 'id' }

// 날짜 글자: 'YYYY-MM-DD' (점·빗금도 받는다, 한 자리 월·일 허용)
function normalizeDate(text: string): string | null {
  const match = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(text.trim())
  if (!match) return null
  const value = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

type Group = { key: string; rows: UploadRow[]; data?: AsnCreateData }

// 검증 (fixedShipperId: 화주 포털 — 화주사 칸 없이 자기 화주사)
export async function checkAsnUpload(
  rows: UploadRow[],
  scope: DataScope,
  fixedShipperId?: bigint,
): Promise<{ issues: UploadIssue[]; groups: Group[] }> {
  const template = asnUploadTemplate(fixedShipperId === undefined)
  const issues: UploadIssue[] = requiredIssues(template, rows)
  const add = (row: UploadRow, column: string | undefined, message: string) =>
    issues.push({ rowNo: row.rowNo, column, message })

  // 코드 → 키 (범위 안의 사용 중인 화주사, 사용 중인 센터)
  const shippers = await prisma.shipper.findMany({
    where: { AND: [scopeFilter(scope, SHIPPER_SCOPE), ACTIVE_ONLY] },
    select: { id: true, code: true, centers: { select: { centerId: true } } },
  })
  const centers = await prisma.center.findMany({
    where: { ...ACTIVE_ONLY },
    select: { id: true, code: true },
  })
  const shipperByCode = new Map(shippers.map((s) => [s.code.toUpperCase(), s]))
  const shipperById = new Map(shippers.map((s) => [s.id, s]))
  const centerByCode = new Map(centers.map((c) => [c.code.toUpperCase(), c]))

  // 묶음키로 나누기 (파일 순서대로)
  const groups = new Map<string, UploadRow[]>()
  for (const row of rows) {
    const key = row.values.groupKey
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  // 화주사별 품목 (코드 → 품목)
  const shipperIds = new Set<bigint>()
  const resolveShipper = (row: UploadRow) => {
    if (fixedShipperId !== undefined) return shipperById.get(fixedShipperId)
    return shipperByCode.get((row.values.shipperCode ?? '').toUpperCase())
  }
  for (const row of rows) {
    const shipper = resolveShipper(row)
    if (shipper) shipperIds.add(shipper.id)
  }
  const items = await prisma.item.findMany({
    where: { shipperId: { in: [...shipperIds] } },
    select: { ...asnItemSelect(requireOperatorId()), shipperId: true },
  })
  // 단위 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
  resolveUnitDecimals(items)
  const itemByKey = new Map(items.map((item) => [`${item.shipperId}:${item.code}`, item]))

  const result: Group[] = []
  for (const [key, groupRows] of groups) {
    const first = groupRows[0]
    // 헤더 칸은 묶음 안에서 같아야 한다
    const headerKeys = ['shipperCode', 'centerCode', 'expectedOn', 'shipperRefNo'] as const
    let consistent = true
    for (const row of groupRows.slice(1)) {
      for (const column of headerKeys) {
        if ((row.values[column] ?? '') !== (first.values[column] ?? '')) {
          add(row, column, `같은 묶음(${key})의 첫 줄(${first.rowNo}행)과 다릅니다.`)
          consistent = false
        }
      }
    }

    const shipper = resolveShipper(first)
    if (!shipper) {
      if (fixedShipperId === undefined && first.values.shipperCode) {
        add(first, 'shipperCode', '없거나 사용 중지된 화주사입니다.')
      }
      continue
    }
    const center = centerByCode.get((first.values.centerCode ?? '').toUpperCase())
    if (first.values.centerCode) {
      if (!center) add(first, 'centerCode', '없거나 사용 중지된 센터입니다.')
      else if (!shipper.centers.some((c) => c.centerId === center.id)) {
        add(first, 'centerCode', '이 화주사가 이용하지 않는 센터입니다.')
      } else if (scope.kind === 'CENTERS' && !scope.centerIds.includes(center.id)) {
        add(first, 'centerCode', '내 소속 센터가 아닙니다.')
      }
    }
    const expectedOn = first.values.expectedOn ? normalizeDate(first.values.expectedOn) : null
    if (first.values.expectedOn && !expectedOn) {
      add(first, 'expectedOn', '날짜 형식이 아닙니다 (예: 2026-11-20).')
    }
    if ((first.values.shipperRefNo ?? '').length > 50)
      add(first, 'shipperRefNo', '50자 이하로 넣어 주세요.')

    // 라인: 입력 규칙 → 품목·단위·수량·로트 검사 (화면 등록과 같은 함수)
    const lines: AsnCreateData['lines'] = []
    for (const row of groupRows) {
      const item = itemByKey.get(`${shipper.id}:${(row.values.itemCode ?? '').toUpperCase()}`)
      if (row.values.itemCode && !item) {
        add(row, 'itemCode', '이 화주사의 품목이 아닙니다.')
        continue
      }
      if (!item) continue
      const expiryText = row.values.expiryOn ?? ''
      const expiry = expiryText ? normalizeDate(expiryText) : ''
      if (expiry === null) {
        add(row, 'expiryOn', '날짜 형식이 아닙니다 (예: 2027-01-31).')
        continue
      }
      // 제조일 (선택, 0089)
      const mfgText = row.values.mfgOn ?? ''
      const mfg = mfgText ? normalizeDate(mfgText) : ''
      if (mfg === null) {
        add(row, 'mfgOn', '날짜 형식이 아닙니다 (예: 2026-01-31).')
        continue
      }
      const parsed = asnLineSchema.safeParse({
        itemId: String(item.id),
        unit: row.values.unit || item.baseUnit.code,
        qty: row.values.qty ?? '',
        lotNo: row.values.lotNo ?? '',
        expiryOn: expiry,
        mfgOn: mfg,
        remark: row.values.remark ?? '',
      })
      if (!parsed.success) {
        for (const problem of parsed.error.issues) {
          const column = String(problem.path[0] ?? '')
          add(row, column === 'itemId' ? 'itemCode' : column, problem.message)
        }
        continue
      }
      try {
        resolveAsnLine(item, parsed.data)
        lines.push(parsed.data)
      } catch (error) {
        if (!(error instanceof ActionError)) throw error
        add(row, undefined, error.message)
      }
    }

    if (consistent && center && expectedOn && lines.length === groupRows.length) {
      result.push({
        key,
        rows: groupRows,
        data: {
          shipperId: shipper.id,
          centerId: center.id,
          expectedOn,
          shipperRefNo: first.values.shipperRefNo || null,
          remark: null,
          lines,
        },
      })
    } else {
      result.push({ key, rows: groupRows })
    }
  }
  return { issues, groups: result }
}

// 검증 결과 미리보기 (묶음 수 안내 포함)
export async function previewAsnUpload(
  rows: UploadRow[],
  scope: DataScope,
  fixedShipperId?: bigint,
): Promise<UploadPreview> {
  const { issues, groups } = await checkAsnUpload(rows, scope, fixedShipperId)
  const template = asnUploadTemplate(fixedShipperId === undefined)
  const preview = buildPreview(template, rows, issues)
  if (preview.errorCount === 0) {
    preview.summary = `${rows.length}행 모두 올바릅니다. ASN ${groups.length}건으로 등록됩니다.`
  }
  return preview
}

// 등록: 다시 검증 → 문제가 하나라도 있으면 거부, 없으면 모든 ASN을 한 트랜잭션으로 (등록 경로 EXCEL)
export async function commitAsnUpload(
  rows: UploadRow[],
  scope: DataScope,
  fixedShipperId?: bigint,
) {
  const { issues, groups } = await checkAsnUpload(rows, scope, fixedShipperId)
  if (issues.length > 0 || groups.some((g) => !g.data)) {
    throw new ActionError(
      'VALIDATION',
      '오류가 있는 행이 있어 등록하지 않았습니다. 미리보기에서 오류를 확인해 주세요.',
    )
  }
  const created = await prisma.$transaction(
    async (tx) => {
      const asns = []
      for (const group of groups) asns.push(await createAsnInTx(tx, group.data!, 'EXCEL', scope))
      return asns
    },
    { timeout: 60_000 },
  )
  return {
    count: created.length,
    asnNos: created.map((a) => a.asnNo),
    message: `ASN ${created.length}건을 등록했습니다 (${created[0]?.asnNo}${created.length > 1 ? ` ~ ${created[created.length - 1].asnNo}` : ''}).`,
  }
}
