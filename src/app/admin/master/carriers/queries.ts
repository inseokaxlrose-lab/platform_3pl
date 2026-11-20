import 'server-only'
import { CARRIER_STATUS, CARRIER_TYPE, INVOICE_CHECK_RULE } from '@/lib/carriers/carrier-codes'
import type { CarrierCreateInput } from '@/lib/carriers/carrier-schema'
import { toValue } from '@/lib/db-value'
import { prisma } from '@/lib/prisma'
import { operatorFilter, type DataScope } from '@/lib/scope/data-scope'

// 운송사 수정 화면 조회 (0094): 이 운영사의 운송사만 (다른 운영사 것은 "찾을 수 없음")
export async function getCarrierForEdit(id: bigint, scope: DataScope) {
  const row = await prisma.carrier.findFirst({
    where: { id, ...operatorFilter(scope) },
    select: {
      id: true,
      code: true,
      custCode: true,
      name: true,
      carrierType: true,
      invoiceDigits: true,
      invoiceCheck: true,
      trackingUrl: true,
      tel: true,
      status: true,
      sortOrder: true,
      remark: true,
      rowVersion: true,
      _count: { select: { contracts: { where: { delYn: 'N' } } } },
    },
  })
  if (!row) return null
  const input: CarrierCreateInput = {
    code: row.code,
    custCode: row.custCode ?? '',
    name: row.name,
    carrierType: toValue(CARRIER_TYPE.values, row.carrierType),
    invoiceDigits: row.invoiceDigits === null ? '' : String(row.invoiceDigits),
    invoiceCheck: toValue(INVOICE_CHECK_RULE.values, row.invoiceCheck),
    trackingUrl: row.trackingUrl ?? '',
    tel: row.tel ?? '',
    status: toValue(CARRIER_STATUS.values, row.status),
    sortOrder: row.sortOrder,
    remark: row.remark ?? '',
  }
  return {
    id: String(row.id),
    rowVersion: row.rowVersion,
    contractCount: row._count.contracts,
    input,
  }
}

export type CarrierForEdit = NonNullable<Awaited<ReturnType<typeof getCarrierForEdit>>>
