'use server'

import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { listAsns } from '@/lib/inbound/asn-list'
import { assertAsnsInScope } from '@/lib/inbound/asns'
import { putawaySchema } from '@/lib/inbound/putaway-schema'
import { registerPutaway } from '@/lib/inbound/putaways'

// 적치 서버 액션 (docs/decisions/0058) — 권한 inbound.putaway.*, 데이터 범위는 ASN 범위

// 적치할 ASN 고르기: 적치 상태를 고르지 않으면 적치대기·부분적치이면서 확정이 있는 것
export const listPutawayAsnsAction = createAction({
  permission: 'inbound.putaway.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) =>
    listAsns(
      {
        ...input,
        exportAll: false,
        filters: {
          putaway: 'WAITING,PARTIAL',
          status: 'PARTIAL,COMPLETED,CLOSED',
          ...input.filters,
        },
      },
      scope,
    ),
})

export const registerPutawayAction = createAction({
  permission: 'inbound.putaway.confirm',
  input: putawaySchema,
  handler: async ({ input, scope }) => {
    await assertAsnsInScope([input.asnId], scope)
    return registerPutaway(input)
  },
})
