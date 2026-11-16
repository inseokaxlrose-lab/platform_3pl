'use server'

import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { listAsns } from '@/lib/inbound/asn-list'
import { assertAsnsInScope } from '@/lib/inbound/asns'
import { receiptSchema } from '@/lib/inbound/receipt-schema'
import { confirmReceipt } from '@/lib/inbound/receipts'

// 입고 확정 서버 액션 (docs/decisions/0057) — 권한 inbound.confirm.*, 데이터 범위는 ASN 범위

// 확정할 ASN 고르기: 상태를 고르지 않으면 검수중·부분확정
export const listConfirmAsnsAction = createAction({
  permission: 'inbound.confirm.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) =>
    listAsns(
      { ...input, exportAll: false, filters: { status: 'INSPECTING,PARTIAL', ...input.filters } },
      scope,
    ),
})

export const confirmReceiptAction = createAction({
  permission: 'inbound.confirm.confirm',
  input: receiptSchema,
  handler: async ({ input, scope }) => {
    await assertAsnsInScope([input.asnId], scope)
    return confirmReceipt(input)
  },
})
