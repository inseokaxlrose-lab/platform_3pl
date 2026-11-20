import 'server-only'
import type { NumberingTarget } from '@/lib/numbering/numbering-codes'
import { listNumberingRules } from '@/lib/numbering/numbering-rules'
import { prisma } from '@/lib/prisma'
import type { NumberingRuleForEdit } from './numbering-rule-form'

// 체번 규칙 수정 화면 조회 (0085) — 이 운영사에 적용 중인 규칙 + 시스템 기본 + 미리보기 재료
export async function getNumberingRuleForEdit(
  operatorId: bigint,
  target: NumberingTarget,
): Promise<NumberingRuleForEdit | null> {
  const found = (await listNumberingRules(prisma, operatorId)).find((v) => v.target === target)
  if (!found) return null
  return {
    target: found.target,
    targetLabel: found.targetLabel,
    rule: found.rule,
    system: found.system,
    overridden: found.overridden,
    rowVersion: found.rowVersion,
    sample: found.sample,
    issued: found.issued,
    timeZone: found.timeZone,
  }
}
