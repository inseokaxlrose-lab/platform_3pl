'use server'

import { z } from 'zod'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { statusWhere } from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import {
  listExternalCodeTargets,
  saveExternalCodeMapping,
} from '@/lib/master-code/external-code-mapping'
import { externalCodesSchema } from '@/lib/master-code/external-codes-schema'
import { EXTERNAL_TARGETS, parseExternalTarget } from '@/lib/master-code/external-code-targets'
import { withIsActive } from '@/lib/status'

// 외부코드 매핑 서버 액션 (docs/decisions/0068)

// 목록 (검색 조건: 화면 searchFields와 같은 키 — target·mapping·status)
export const listExternalCodesAction = createAction({
  permission: 'master.external-codes.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) => {
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'name'],
      sortable: { code: 'code', name: 'name' },
      defaultOrderBy: { code: 'asc' },
    })
    const result = await listExternalCodeTargets(
      {
        target: parseExternalTarget(input.filters.target),
        mapping: input.filters.mapping,
        query,
        statusWhere: statusWhere(input.filters),
      },
      scope,
    )
    return { rows: result.rows.map(withIsActive), rowCount: result.rowCount }
  },
})

// 한 대상의 외부코드 저장 (비운 칸은 매핑 삭제)
export const saveExternalCodesAction = createAction({
  permission: 'master.external-codes.update',
  input: z.object({
    target: z.enum(EXTERNAL_TARGETS),
    id: idSchema,
    codes: externalCodesSchema,
  }),
  handler: ({ input, scope }) => saveExternalCodeMapping(input, scope),
})
