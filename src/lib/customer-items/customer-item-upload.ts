import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { buildPreview, requiredIssues, type UploadIssue, type UploadRow } from '@/lib/excel/upload'
import { keyLabel, keyWhere, type IfKeyType } from '@/lib/master-code/if-key'
import { prisma, type Db } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { isActiveStatus } from '@/lib/status'
import { qtyText, parseQty } from '@/lib/units/convert'
import {
  customerItemSchema,
  type CustomerItemData,
  type CustomerItemInput,
} from './customer-item-schema'
import { customerItemUploadTemplate } from './customer-item-upload-template'
import { createCustomerItemIn, updateCustomerItemIn } from './customer-items'

// 거래처별 품목코드 엑셀 업로드 (docs/decisions/0098)
// 검증 = 실제로 처리해 본 뒤 되돌린다, 등록 = 다시 처리하고 오류가 하나라도 있으면 되돌린다 (거래처 업로드와 같은 방식)

const SHIPPER_SCOPE = { center: 'centers.some.centerId', shipper: 'id' }
const KEY_COLUMNS: Record<IfKeyType, { customer: string; item: string }> = {
  CODE: { customer: 'customerCd', item: 'itemCd' },
  CUST_CD: { customer: 'customerCustCd', item: 'itemCustCd' },
}

const cell = (row: UploadRow, key: string) => (row.values[key] ?? '').trim()

type Planned = {
  row: UploadRow
  existing: { id: bigint; rowVersion: number } | null
  data: CustomerItemData
}

// 칸 → 저장할 값 (이미 있으면 비운 칸은 지금 값)
async function planRows(rows: UploadRow[], scope: DataScope) {
  const issues: UploadIssue[] = [...requiredIssues(customerItemUploadTemplate, rows)]
  const planned: Planned[] = []
  const shippers = new Map<string, { id: bigint; keyType: IfKeyType } | null>()
  const seen = new Map<string, number>()

  for (const row of rows) {
    const issue = (message: string, column?: string) =>
      issues.push({ rowNo: row.rowNo, column, message })
    const shipperCode = cell(row, 'shipperCode')
    if (!shipperCode) continue
    if (!shippers.has(shipperCode)) {
      const found = await prisma.shipper.findFirst({
        where: { AND: [{ code: shipperCode }, scopeFilter(scope, SHIPPER_SCOPE)] },
        select: { id: true, ifKeyType: true },
      })
      shippers.set(
        shipperCode,
        found && { id: found.id, keyType: found.ifKeyType === 'CUST_CD' ? 'CUST_CD' : 'CODE' },
      )
    }
    const shipper = shippers.get(shipperCode)
    if (!shipper) {
      issue('화주사를 찾을 수 없습니다.', 'shipperCode')
      continue
    }
    const columns = KEY_COLUMNS[shipper.keyType]
    const customerKey = cell(row, columns.customer)
    const itemKey = cell(row, columns.item)
    if (!customerKey)
      issue(`${keyLabel(shipper.keyType, '거래처')}를 넣어 주세요.`, columns.customer)
    if (!itemKey) issue(`${keyLabel(shipper.keyType, '품목')}를 넣어 주세요.`, columns.item)
    if (!customerKey || !itemKey) continue

    const [customer, item] = await Promise.all([
      prisma.customer.findFirst({
        where: { shipperId: shipper.id, ...keyWhere(shipper.keyType, customerKey) },
        select: { id: true },
      }),
      prisma.item.findFirst({
        where: { shipperId: shipper.id, ...keyWhere(shipper.keyType, itemKey) },
        select: { id: true, units: { select: { unitId: true, unit: { select: { code: true } } } } },
      }),
    ])
    if (!customer) issue('거래처를 찾을 수 없습니다.', columns.customer)
    if (!item) issue('품목을 찾을 수 없습니다.', columns.item)
    if (!customer || !item) continue

    const pairKey = `${customer.id}:${item.id}`
    if (seen.has(pairKey)) {
      issue(`같은 거래처·품목이 ${seen.get(pairKey)}행에도 있습니다.`)
      continue
    }
    seen.set(pairKey, row.rowNo)

    const existing = await prisma.customerItem.findFirst({
      where: { customerId: customer.id, itemId: item.id },
    })
    // 납품 단위: 품목의 단위코드
    const unitCode = cell(row, 'deliveryUnit').toUpperCase()
    const unit = unitCode ? item.units.find((u) => u.unit.code === unitCode) : undefined
    if (unitCode && !unit) {
      issue(`품목의 단위가 아닙니다: ${unitCode}`, 'deliveryUnit')
      continue
    }
    const useYn = cell(row, 'useYn').toUpperCase()
    if (useYn && useYn !== 'Y' && useYn !== 'N') {
      issue('Y 또는 N으로 넣어 주세요.', 'useYn')
      continue
    }
    const daysText = cell(row, 'minShelfDays')
    if (daysText && !/^\d+$/.test(daysText)) {
      issue('0 이상의 정수로 넣어 주세요.', 'minShelfDays')
      continue
    }

    // 지금 값 (없으면 새 줄 기본값) 위에 넣은 칸만 덮는다
    const base: CustomerItemInput = existing
      ? {
          customerId: String(customer.id),
          itemId: String(item.id),
          custItemCode: existing.custItemCode,
          custItemName: existing.custItemName ?? '',
          custBarcode: existing.custBarcode ?? '',
          deliveryUnitId: existing.deliveryUnitId === null ? '' : String(existing.deliveryUnitId),
          minShelfDays: existing.minShelfDays,
          minShelfRatio:
            existing.minShelfRatio === null
              ? ''
              : qtyText(parseQty(existing.minShelfRatio.toString())),
          isActive: isActiveStatus(existing.status),
          remark: existing.remark ?? '',
        }
      : {
          customerId: String(customer.id),
          itemId: String(item.id),
          custItemCode: '',
          custItemName: '',
          custBarcode: '',
          deliveryUnitId: '',
          minShelfDays: null,
          minShelfRatio: '',
          isActive: true,
          remark: '',
        }
    const filled = (key: string) => cell(row, key) !== ''
    const input: CustomerItemInput = {
      ...base,
      custItemCode: cell(row, 'custItemCode') || base.custItemCode,
      ...(filled('custItemName') && { custItemName: cell(row, 'custItemName') }),
      ...(filled('custBarcode') && { custBarcode: cell(row, 'custBarcode') }),
      ...(unit && { deliveryUnitId: String(unit.unitId) }),
      ...(daysText && { minShelfDays: Number(daysText) }),
      ...(filled('minShelfRatio') && { minShelfRatio: cell(row, 'minShelfRatio') }),
      ...(useYn && { isActive: useYn === 'Y' }),
      ...(filled('remark') && { remark: cell(row, 'remark') }),
    }
    const parsed = customerItemSchema.safeParse(input)
    if (!parsed.success) {
      for (const problem of parsed.error.issues) {
        issue(problem.message, String(problem.path[0] ?? '') || undefined)
      }
      continue
    }
    planned.push({
      row,
      existing: existing && { id: existing.id, rowVersion: existing.rowVersion },
      data: parsed.data,
    })
  }
  return { issues, planned }
}

type Summary = { created: number; updated: number }

// 계획한 줄을 저장 (트랜잭션 안). 줄마다 검사 오류는 그 행의 문제로 모은다
async function runRows(tx: Db, planned: Planned[], scope: DataScope, issues: UploadIssue[]) {
  const summary: Summary = { created: 0, updated: 0 }
  for (const { row, existing, data } of planned) {
    try {
      if (existing) {
        await updateCustomerItemIn(tx, existing.id, existing.rowVersion, data, scope)
        summary.updated++
      } else {
        await createCustomerItemIn(tx, data, scope)
        summary.created++
      }
    } catch (error) {
      if (!(error instanceof ActionError)) throw error
      issues.push({ rowNo: row.rowNo, message: error.message })
    }
  }
  return summary
}

class Rollback extends Error {}

const summaryText = (s: Summary) => `신규 ${s.created} · 수정 ${s.updated}`
const FAILED = '오류가 있는 행이 있어 등록하지 않았습니다. 다시 확인해 주세요.'

export async function previewCustomerItemUpload(rows: UploadRow[], scope: DataScope) {
  const { issues, planned } = await planRows(rows, scope)
  let summary: Summary | null = null
  try {
    await prisma.$transaction(
      async (tx) => {
        summary = await runRows(tx, planned, scope, issues)
        throw new Rollback()
      },
      { timeout: 120_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  const preview = buildPreview(customerItemUploadTemplate, rows, issues)
  return issues.length === 0 && summary
    ? { ...preview, summary: `${rows.length}행 모두 올바릅니다. ${summaryText(summary)}` }
    : preview
}

export async function commitCustomerItemUpload(rows: UploadRow[], scope: DataScope) {
  const { issues, planned } = await planRows(rows, scope)
  if (issues.length > 0) throw new ActionError('VALIDATION', FAILED)
  return prisma.$transaction(
    async (tx) => {
      const summary = await runRows(tx, planned, scope, issues)
      if (issues.length > 0) throw new ActionError('VALIDATION', FAILED)
      return { message: `등록했습니다. ${summaryText(summary)}` }
    },
    { timeout: 120_000 },
  )
}
