import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import {
  buildPreview,
  requiredIssues,
  type UploadIssue,
  type UploadPreview,
  type UploadRow,
} from '@/lib/excel/upload'
import type { IfKeyType } from '@/lib/master-code/if-key'
import { prisma, type Db } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { SHIPPER_SETUP_ONLY } from '@/lib/shippers/shipper-codes'
import { SHIPPER_SCOPE } from './customer-list'
import { customerUploadTemplate } from './customer-upload-template'
import {
  itemErrorOf,
  apiCustomerSchema,
  upsertCustomer,
  type CustomerItem,
  type CustomerShipToItem,
} from './customer-upsert'

// 거래처 엑셀 업로드 (docs/decisions/0082 ③) — API upsert(upsertCustomer)와 같은 서비스
// 검증: 파일 전체를 한 트랜잭션에서 실제로 처리해 본 뒤 되돌린다 (신규·수정·배송센터 결과까지 미리보기)
// 등록: 같은 처리를 다시 하고, 오류가 하나라도 있으면 아무것도 저장하지 않는다 (0049 공통 규칙)
// 등록 경로 UPLOAD, 화주 정책은 쓰지 않는다 (운영사가 올림 — 못 정한 배송센터는 "확인 필요"로 저장)

// 거래처 칸 (줄마다 반복, 다르면 오류)
const CUSTOMER_KEYS = [
  'customerCd',
  'customerCustCd',
  'customerNm',
  'shortNm',
  'customerType',
  'customerRole',
  'customerGroup',
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

const ROLE_OF: Record<string, string> = { 매출처: 'SALES', 매입처: 'PURCHASE', 둘다: 'BOTH' }

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

type Group = { shipperId: bigint; keyType: IfKeyType; rows: UploadRow[]; item?: CustomerItem }

// 화주 연동 조회 키에 따른 엑셀 칸 (0084)
const KEY_COLUMNS = {
  CODE: {
    customer: 'customerCd',
    shipTo: 'shipToCd',
    label: '거래처코드',
    shipToLabel: '납품처코드',
  },
  CUST_CD: {
    customer: 'customerCustCd',
    shipTo: 'shipToCustCd',
    label: '거래처사용자정의코드',
    shipToLabel: '납품처사용자정의코드',
  },
} as const
const cell = (row: UploadRow, key: string) => (row.values[key] ?? '').trim()
// 우리 코드는 대문자로 묶고, 사용자 정의 코드는 그대로
const keyValue = (keyType: IfKeyType, value: string) =>
  keyType === 'CUST_CD' ? value : value.toUpperCase()

// 파일 → 거래처 묶음 (형식 오류는 issues에)
async function groupRows(rows: UploadRow[], scope: DataScope) {
  const issues: UploadIssue[] = requiredIssues(customerUploadTemplate, rows)
  const add = (row: UploadRow, column: string | undefined, message: string) =>
    issues.push({ rowNo: row.rowNo, column, message })
  const shippers = await prisma.shipper.findMany({
    where: { AND: [scopeFilter(scope, SHIPPER_SCOPE), SHIPPER_SETUP_ONLY] },
    select: { id: true, code: true, ifKeyType: true },
  })
  const shipperByCode = new Map(
    shippers.map((s) => [
      s.code.toUpperCase(),
      { id: s.id, keyType: (s.ifKeyType === 'CUST_CD' ? 'CUST_CD' : 'CODE') as IfKeyType },
    ]),
  )

  const groups = new Map<string, Group>()
  for (const row of rows) {
    const shipperCode = cell(row, 'shipperCode').toUpperCase()
    if (!shipperCode) continue
    const shipper = shipperByCode.get(shipperCode)
    if (!shipper) {
      add(row, 'shipperCode', `없거나 거래처를 등록할 수 없는 화주사입니다 (${shipperCode}).`)
      continue
    }
    // 거래처 키: 화주 연동 조회 키에 따라 거래처코드 또는 거래처사용자정의코드
    const columns = KEY_COLUMNS[shipper.keyType]
    const customerKey = keyValue(shipper.keyType, cell(row, columns.customer))
    if (!customerKey) {
      add(
        row,
        columns.customer,
        `이 화주사는 ${columns.label}로 거래처를 찾습니다. ${columns.label}를 넣어 주세요.`,
      )
      continue
    }
    const key = `${shipperCode}|${customerKey}`
    const group = groups.get(key) ?? { shipperId: shipper.id, keyType: shipper.keyType, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    const first = group.rows[0]
    const item: Record<string, unknown> = {}
    const columns = KEY_COLUMNS[group.keyType]
    // 거래처 칸: 넣은 값만 (줄마다 다르면 오류)
    for (const key of CUSTOMER_KEYS) {
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
      } else if (key === 'customerRole') {
        // 역할 (0090): 매출처 / 매입처 / 둘다 (비우면 그대로·새 거래처는 매출처)
        if (!ROLE_OF[value]) add(first, key, '매출처 / 매입처 / 둘다 중 하나입니다.')
        else item.customerRole = ROLE_OF[value] as CustomerItem['customerRole']
      } else if (key === 'status') {
        if (!STATUS_OF[value]) add(first, key, '거래중 / 거래중지 중 하나입니다.')
        else item.status = STATUS_OF[value]
      } else item[key] = value
    }
    // 납품처: 납품처 키(납품처코드 또는 납품처사용자정의코드)가 있는 줄마다
    const shipTos: CustomerShipToItem[] = []
    for (const row of group.rows) {
      if (!cell(row, columns.shipTo)) {
        // 납품처 키가 아닌 다른 코드 칸만 넣은 줄
        if (cell(row, 'shipToCd') || cell(row, 'shipToCustCd'))
          add(
            row,
            columns.shipTo,
            `이 화주사는 ${columns.shipToLabel}로 납품처를 찾습니다. ${columns.shipToLabel}를 넣어 주세요.`,
          )
        continue
      }
      const shipTo: Record<string, unknown> = {}
      if (cell(row, 'shipToCd')) shipTo.shipToCd = cell(row, 'shipToCd')
      if (cell(row, 'shipToCustCd')) shipTo.shipToCustCd = cell(row, 'shipToCustCd')
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
      shipTos.push(shipTo as CustomerShipToItem)
    }
    if (shipTos.length > 0) item.shipTos = shipTos
    const parsed = apiCustomerSchema.safeParse(item)
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
      const result = await upsertCustomer(tx, group.item, {
        shipperId: group.shipperId,
        keyType: group.keyType,
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
      const shipToRows = group.rows.filter((r) => cell(r, KEY_COLUMNS[group.keyType].shipTo))
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
