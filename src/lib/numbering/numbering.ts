import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import type { Db } from '@/lib/prisma'
import {
  autoPatternOf,
  codeHead,
  formatCode,
  periodKeyOf,
  type NumberingRuleSpec,
  type NumberingTarget,
} from './numbering-codes'

// 체번 (docs/decisions/0084) — 기준정보 코드와 업무 문서 번호를 모두 여기서만 발급한다
// 규칙: 운영사 재정의 행 > 시스템 기본 행 (tb_numbering_rule)
// 현재값: tb_numbering_seq를 한 문장으로 원자적 증가 → 동시에 여러 건을 등록해도 겹치지 않는다
// 트랜잭션이 실패하면 결번이 생길 수 있다 (허용)

export type NumberingContext = {
  operatorId: bigint
  // 범위 키: SHIPPER 범위면 화주사, CUSTOMER 범위면 거래처
  shipperId?: bigint
  customerId?: bigint
  // 접두어: SHIPPER_PREFIX면 화주 code_prefix, PARENT_CD면 상위 코드(납품처 → 거래처코드)
  prefix?: string
  // 기준 시각 (날짜·주기). 없으면 지금
  at?: Date
}

// 대상의 규칙 (운영사 행이 있으면 그것)
export async function loadNumberingRule(
  db: Db,
  operatorId: bigint,
  target: NumberingTarget,
): Promise<NumberingRuleSpec> {
  const rows = await db.numberingRule.findMany({
    where: { target, OR: [{ operatorId }, { operatorId: null }] },
  })
  const rule =
    rows.find((r) => r.operatorId === operatorId) ?? rows.find((r) => r.operatorId === null)
  if (!rule) throw new Error(`체번 규칙이 없습니다: ${target}`)
  return rule as unknown as NumberingRuleSpec
}

function prefixOf(rule: NumberingRuleSpec, ctx: NumberingContext) {
  if (rule.prefixSource === 'FIXED') return rule.fixedPrefix ?? ''
  if (!ctx.prefix) {
    throw new ActionError(
      'VALIDATION',
      rule.prefixSource === 'SHIPPER_PREFIX'
        ? '화주사의 코드 접두어(code_prefix)가 없어 코드를 만들 수 없습니다.'
        : '상위 코드가 없어 코드를 만들 수 없습니다.',
    )
  }
  return ctx.prefix
}

function scopeIdOf(rule: NumberingRuleSpec, ctx: NumberingContext) {
  if (rule.scope === 'OPERATOR') return 0n
  const id = rule.scope === 'SHIPPER' ? ctx.shipperId : ctx.customerId
  if (id === undefined) throw new Error(`체번 범위 키가 없습니다: ${rule.target} (${rule.scope})`)
  return id
}

async function timeZoneOf(db: Db, operatorId: bigint) {
  const operator = await db.operator.findUnique({
    where: { id: operatorId },
    select: { timezone: true },
  })
  return operator?.timezone ?? 'Asia/Seoul'
}

// n건을 한 번에 발급 (API 500건·일괄 등록): 범위를 한 번에 받아 연속 번호를 돌려준다
export async function issueCodes(
  db: Db,
  target: NumberingTarget,
  ctx: NumberingContext,
  count: number,
): Promise<string[]> {
  if (count < 1) return []
  const rule = await loadNumberingRule(db, ctx.operatorId, target)
  const at = ctx.at ?? new Date()
  const timeZone = await timeZoneOf(db, ctx.operatorId)
  const head = codeHead(rule, prefixOf(rule, ctx), at, timeZone)
  const scopeId = scopeIdOf(rule, ctx)
  const periodKey = periodKeyOf(rule.resetCycle, at, timeZone)
  // 한 문장으로 원자적 증가 (값은 모두 바인딩 — 표·칸 이름만 고정 글자)
  const [row] = await db.$queryRaw<{ last_seq: bigint }[]>`
    INSERT INTO tb_numbering_seq (operator_id, target_cd, scope_id, period_key, last_seq, updated_at)
    VALUES (${ctx.operatorId}, ${target}, ${scopeId}, ${periodKey}, ${BigInt(count)}, now())
    ON CONFLICT (operator_id, target_cd, scope_id, period_key)
    DO UPDATE SET last_seq = tb_numbering_seq.last_seq + ${BigInt(count)}, updated_at = now()
    RETURNING last_seq
  `
  const first = row.last_seq - BigInt(count) + 1n
  return Array.from({ length: count }, (_, i) =>
    formatCode(head, first + BigInt(i), rule.seqLength),
  )
}

// 한 건 발급
export async function issueCode(db: Db, target: NumberingTarget, ctx: NumberingContext) {
  const [code] = await issueCodes(db, target, ctx, 1)
  return code
}

// 직접 입력한 코드가 자동 체번 모양인지 (같으면 거부 — 나중에 자동 발급과 겹치지 않게)
export async function isAutoPattern(
  db: Db,
  target: NumberingTarget,
  ctx: Pick<NumberingContext, 'operatorId' | 'prefix'>,
  value: string,
) {
  const rule = await loadNumberingRule(db, ctx.operatorId, target)
  if (rule.prefixSource !== 'FIXED' && !ctx.prefix) return false
  return autoPatternOf(rule, prefixOf(rule, ctx)).test(value.trim().toUpperCase())
}
