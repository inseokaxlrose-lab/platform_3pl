import 'server-only'
import { CARRIER_STATUS } from '@/lib/carriers/carrier-codes'
import { carrierOptions } from '@/lib/carriers/carriers'
import type { ContractInput } from '@/lib/carriers/contract-schema'
import { toValue } from '@/lib/db-value'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { NOT_DELETED } from '@/lib/status'
import { isYes } from '@/lib/yn'

// 운송 계약 화면 조회 (docs/decisions/0094) — 센터 직원은 소속 센터의 계약만

const dayText = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : '')

// 고르기 선택지: 데이터 범위 안 센터(그 센터를 이용하는 화주사 포함) + 운송사(사용 중 + 지금 계약의 운송사)
export async function getContractOptions(scope: DataScope, keepCarrierIds: bigint[] = []) {
  if (scope.operatorId === undefined) return { centers: [], carriers: [] }
  const [centers, carriers] = await Promise.all([
    prisma.center.findMany({
      where: scopeFilter(scope, { center: 'id' }),
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        shippers: {
          where: { shipper: NOT_DELETED },
          select: { shipper: { select: { id: true, code: true, name: true } } },
          orderBy: { shipper: { code: 'asc' } },
        },
      },
    }),
    carrierOptions(prisma, scope.operatorId, keepCarrierIds),
  ])
  return textIds({
    centers: centers.map(({ shippers, ...center }) => ({
      ...center,
      shippers: shippers.map((s) => s.shipper),
    })),
    carriers,
  })
}

export type ContractOptions = Awaited<ReturnType<typeof getContractOptions>>

// 수정 화면 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getContractForEdit(id: bigint, scope: DataScope) {
  const row = await prisma.carrierContract.findUnique({
    where: { id },
    select: {
      id: true,
      operatorId: true,
      carrierId: true,
      centerId: true,
      shipperId: true,
      custNo: true,
      pickupBranch: true,
      invoiceStart: true,
      invoiceEnd: true,
      invoiceNext: true,
      defaultYn: true,
      validFrom: true,
      validTo: true,
      status: true,
      remark: true,
      rowVersion: true,
      carrier: { select: { code: true, name: true } },
      center: { select: { code: true, name: true } },
      shipper: { select: { name: true } },
    },
  })
  if (!row || !isInScope(scope, row, { center: 'centerId' })) return null
  const input: ContractInput = {
    carrierId: String(row.carrierId),
    centerId: String(row.centerId),
    shipperId: row.shipperId === null ? '' : String(row.shipperId),
    custNo: row.custNo,
    pickupBranch: row.pickupBranch ?? '',
    invoiceStart: row.invoiceStart ?? '',
    invoiceEnd: row.invoiceEnd ?? '',
    invoiceNext: row.invoiceNext ?? '',
    isDefault: isYes(row.defaultYn),
    validFrom: dayText(row.validFrom),
    validTo: dayText(row.validTo),
    status: toValue(CARRIER_STATUS.values, row.status),
    remark: row.remark ?? '',
  }
  return {
    id: String(row.id),
    rowVersion: row.rowVersion,
    carrierId: row.carrierId,
    title: `${row.carrier.name} · ${row.center.name} · ${row.shipper?.name ?? '센터 공용'}`,
    input,
  }
}

export type ContractForEdit = NonNullable<Awaited<ReturnType<typeof getContractForEdit>>>
