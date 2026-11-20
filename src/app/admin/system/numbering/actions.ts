'use server'

import { z } from 'zod'
import { createAction } from '@/lib/actions/create-action'
import { requireOperatorId } from '@/lib/actor'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { NUMBERING_SCOPE, NUMBERING_TARGET, RESET_CYCLE } from '@/lib/numbering/numbering-codes'
import { numberingRuleSchema } from '@/lib/numbering/numbering-rule-schema'
import {
  listNumberingRules,
  resetNumberingRule,
  saveNumberingRule,
} from '@/lib/numbering/numbering-rules'
import { prisma } from '@/lib/prisma'

// 체번 규칙 서버 액션 (docs/decisions/0085) — 대상 8개라 목록은 한 번에 읽는다

// 번호 모양 설명: 접두어 + 구분 문자 + 날짜 + 구분자 + 0000 (예: {화주 접두어}S000000)
const PREFIX_TEXT = {
  FIXED: '',
  SHIPPER_PREFIX: '{화주 접두어}',
  PARENT_CD: '{거래처코드}',
} as const

export const listNumberingRulesAction = createAction({
  permission: 'system.numbering.read',
  input: listQuerySchema,
  handler: async () => {
    const views = await listNumberingRules(prisma, requireOperatorId())
    const rows = views.map((v) => ({
      id: v.target,
      target: v.target,
      targetLabel: v.targetLabel,
      format:
        (v.rule.prefixSource === 'FIXED'
          ? (v.rule.fixedPrefix ?? '')
          : PREFIX_TEXT[v.rule.prefixSource as keyof typeof PREFIX_TEXT]) +
        (v.rule.typeChar ?? '') +
        (v.rule.dateFormat === 'YYMMDD' ? 'YYMMDD' : '') +
        (v.rule.separator ?? '') +
        '0'.repeat(v.rule.seqLength),
      preview: v.preview,
      previewNote: v.sample.prefixNote,
      scope: NUMBERING_SCOPE.labels[v.rule.scope as keyof typeof NUMBERING_SCOPE.labels],
      resetCycle: RESET_CYCLE.labels[v.rule.resetCycle as keyof typeof RESET_CYCLE.labels],
      source: v.overridden ? 'OPERATOR' : 'SYSTEM',
      issued: v.issued,
    }))
    return { rows, rowCount: rows.length }
  },
})

export const saveNumberingRuleAction = createAction({
  permission: 'system.numbering.update',
  input: numberingRuleSchema.and(z.object({ rowVersion: z.number().int().nullable() })),
  handler: async ({ input: { rowVersion, ...data } }) => saveNumberingRule(data, rowVersion),
})

export const resetNumberingRuleAction = createAction({
  permission: 'system.numbering.update',
  input: z.object({
    target: z.enum(NUMBERING_TARGET.values),
    rowVersion: z.number().int(),
  }),
  handler: async ({ input }) => resetNumberingRule(input.target, input.rowVersion),
})
