'use server'

import { z } from 'zod'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { idSchema } from '@/lib/id'
import { listAsns } from '@/lib/inbound/asn-list'
import { assertAsnsInScope } from '@/lib/inbound/asns'
import { inspectionSchema } from '@/lib/inbound/inspection-schema'
import {
  addInspection,
  asnIdOfInspection,
  asnIdOfLine,
  deleteInspection,
} from '@/lib/inbound/inspections'

// 입고 검수 서버 액션 (docs/decisions/0053) — 권한 inbound.inspection.*, 데이터 범위는 ASN 범위

// 검수할 ASN 고르기: 입고 상태를 고르지 않으면 진행 중인 것만 (예정·검수중·부분확정)
export const listInspectionAsnsAction = createAction({
  permission: 'inbound.inspection.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) =>
    listAsns(
      {
        ...input,
        exportAll: false,
        filters: { status: 'PLANNED,INSPECTING,PARTIAL', ...input.filters },
      },
      scope,
    ),
})

export const addInspectionAction = createAction({
  permission: 'inbound.inspection.update',
  input: inspectionSchema,
  handler: async ({ input, scope }) => {
    await assertAsnsInScope([await asnIdOfLine(input.asnLineId)], scope)
    return addInspection(input)
  },
})

export const deleteInspectionAction = createAction({
  permission: 'inbound.inspection.update',
  input: z.object({ id: idSchema }),
  handler: async ({ input, scope }) => {
    await assertAsnsInScope([await asnIdOfInspection(input.id)], scope)
    return deleteInspection(input.id)
  },
})
