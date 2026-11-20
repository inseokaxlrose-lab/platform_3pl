import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import {
  codeHead,
  NUMBERING_TARGET,
  periodKeyOf,
  previewCode,
  RESET_CYCLE,
  type NumberingRuleSpec,
  type NumberingTarget,
  type PrefixSource,
} from './numbering-codes'
import { numberingRuleIssues, type NumberingRuleData } from './numbering-rule-schema'

// 체번 규칙 관리 (docs/decisions/0085) — 운영사가 시스템 기본 규칙의 "모양 칸"을 재정의한다
// - 운영사 행이 있으면 그 규칙이 이긴다 (loadNumberingRule). 기본으로 되돌리기 = 운영사 행 지우기
// - 저장 전 겹침 검사: 앞으로 발급될 번호와 같은 기존 코드가 있으면 거부한다
//   카운터(tb_numbering_seq)는 모양이 바뀌어도 이어지므로, 겹칠 수 있는 것은
//   ① 예전에 직접 넣은 코드가 새 자동 모양과 같은 경우 ② 초기화 주기를 바꿔 카운터가 1부터 다시 시작하는 경우뿐이다

type RuleRow = NumberingRuleSpec & { id: bigint; operatorId: bigint | null; rowVersion: number }

const SPEC_SELECT = {
  id: true,
  operatorId: true,
  target: true,
  scope: true,
  prefixSource: true,
  fixedPrefix: true,
  typeChar: true,
  separator: true,
  dateFormat: true,
  seqLength: true,
  resetCycle: true,
  rowVersion: true,
} as const

async function timeZoneOf(db: Db, operatorId: bigint) {
  const operator = await db.operator.findUnique({
    where: { id: operatorId },
    select: { timezone: true },
  })
  return operator?.timezone ?? 'Asia/Seoul'
}

// 대상별 범위: 범위 키·접두어·그 범위의 코드 중 "앞부분(head)으로 시작하는 것" (지운 줄 포함)
// suffix = 접두어 뒤의 앞부분 (구분 문자 + 날짜 + 구분자) — 접두어는 범위마다 다르다
type ScopeCode = { scopeId: bigint; prefix: string; code: string }

async function codesStartingWith(
  db: Db,
  operatorId: bigint,
  target: NumberingTarget,
  fixedPrefix: string,
  suffix: string,
): Promise<ScopeCode[]> {
  const fixed = (table: string, column: string) =>
    db.$queryRaw<{ code: string }[]>(Prisma.sql`
      SELECT ${Prisma.raw(column)} AS code FROM ${Prisma.raw(table)}
      WHERE operator_id = ${operatorId} AND starts_with(${Prisma.raw(column)}, ${fixedPrefix + suffix})`)
  const asOperator = async (rows: Promise<{ code: string }[]>) =>
    (await rows).map((r) => ({ scopeId: 0n, prefix: fixedPrefix, code: r.code }))
  switch (target) {
    case 'SHIPPER':
      return asOperator(fixed('tb_shipper', 'shipper_cd'))
    case 'ASN':
      return asOperator(fixed('tb_asn', 'asn_no'))
    case 'RECEIPT':
      return asOperator(fixed('tb_inbound_receipt', 'receipt_no'))
    case 'LABEL':
      return asOperator(fixed('tb_inbound_label', 'label_no'))
    case 'ADJUST':
      return asOperator(fixed('tb_stock_adjust', 'adjust_no'))
    case 'CUSTOMER':
    case 'ITEM': {
      const [table, column] =
        target === 'CUSTOMER' ? ['tb_customer', 'customer_cd'] : ['tb_item', 'item_cd']
      const rows = await db.$queryRaw<{ scope_id: bigint; prefix: string; code: string }[]>(
        Prisma.sql`
          SELECT x.shipper_id AS scope_id, s.code_prefix AS prefix, x.${Prisma.raw(column)} AS code
          FROM ${Prisma.raw(table)} x JOIN tb_shipper s ON s.shipper_id = x.shipper_id
          WHERE x.operator_id = ${operatorId}
            AND starts_with(x.${Prisma.raw(column)}, s.code_prefix || ${suffix})`,
      )
      return rows.map((r) => ({ scopeId: r.scope_id, prefix: r.prefix, code: r.code }))
    }
    case 'SHIP_TO': {
      const rows = await db.$queryRaw<{ scope_id: bigint; prefix: string; code: string }[]>(
        Prisma.sql`
          SELECT st.customer_id AS scope_id, c.customer_cd AS prefix, st.ship_to_cd AS code
          FROM tb_ship_to st JOIN tb_customer c ON c.customer_id = st.customer_id
          WHERE c.operator_id = ${operatorId}
            AND starts_with(st.ship_to_cd, c.customer_cd || ${suffix})`,
      )
      return rows.map((r) => ({ scopeId: r.scope_id, prefix: r.prefix, code: r.code }))
    }
  }
}

// 새 규칙으로 앞으로 발급될 번호와 겹치는 기존 코드 (최대 limit개)
export async function findCodeConflicts(
  db: Db,
  operatorId: bigint,
  rule: NumberingRuleSpec,
  at = new Date(),
  limit = 5,
): Promise<string[]> {
  const timeZone = await timeZoneOf(db, operatorId)
  const suffix = codeHead(rule, '', at, timeZone)
  const periodKey = periodKeyOf(rule.resetCycle, at, timeZone)
  const [codes, seqs] = await Promise.all([
    codesStartingWith(db, operatorId, rule.target, rule.fixedPrefix ?? '', suffix),
    db.numberingSeq.findMany({
      where: { operatorId, target: rule.target, periodKey },
      select: { scopeId: true, lastSeq: true },
    }),
  ])
  const lastOf = new Map(seqs.map((s) => [s.scopeId, s.lastSeq]))
  const conflicts: string[] = []
  for (const { scopeId, prefix, code } of codes) {
    const rest = code.slice(prefix.length + suffix.length)
    if (!/^\d+$/.test(rest) || rest.length < rule.seqLength) continue
    // 앞으로 발급될 번호 = 지금 카운터 + 1 이상
    if (BigInt(rest) > (lastOf.get(scopeId) ?? 0n)) conflicts.push(code)
    if (conflicts.length >= limit) break
  }
  return conflicts
}

// ── 목록·미리보기

export type NumberingRuleView = {
  target: NumberingTarget
  targetLabel: string
  // 지금 적용 중인 규칙 (운영사 행이 있으면 그것)
  rule: NumberingRuleSpec
  // 시스템 기본 (되돌리기·비교용)
  system: NumberingRuleSpec
  overridden: boolean
  // 운영사 행의 버전 (없으면 null — 처음 저장하면 만든다)
  rowVersion: number | null
  // 미리보기 재료: 접두어 예와 초기화 주기별 다음 일련번호
  sample: { prefix: string; prefixNote: string; nextByCycle: Record<string, string> }
  // 이 대상으로 이미 발급한 번호가 있는지 (모양을 바꾸면 예전 번호와 모양이 달라진다)
  issued: boolean
  preview: string
  timeZone: string
}

const toSpec = (r: RuleRow): NumberingRuleSpec => ({
  target: r.target,
  scope: r.scope,
  prefixSource: r.prefixSource,
  fixedPrefix: r.fixedPrefix,
  typeChar: r.typeChar,
  separator: r.separator,
  dateFormat: r.dateFormat,
  seqLength: r.seqLength,
  resetCycle: r.resetCycle,
})

// 접두어 예: 고정 문자 / 첫 화주사의 코드 접두어 / 첫 거래처의 코드 (없으면 예시 값)
async function samplePrefix(db: Db, operatorId: bigint, source: PrefixSource, fixed: string) {
  if (source === 'FIXED') return { prefix: fixed, prefixNote: '', scopeId: 0n }
  if (source === 'SHIPPER_PREFIX') {
    const shipper = await db.shipper.findFirst({
      where: { operatorId },
      select: { id: true, code: true, codePrefix: true },
      orderBy: { code: 'asc' },
    })
    return shipper
      ? {
          prefix: shipper.codePrefix,
          prefixNote: `화주사 ${shipper.code} 기준`,
          scopeId: shipper.id,
        }
      : { prefix: 'AA', prefixNote: '화주 코드 접두어 예시 AA', scopeId: -1n }
  }
  const customer = await db.customer.findFirst({
    where: { operatorId },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  })
  return customer
    ? { prefix: customer.code, prefixNote: `거래처 ${customer.code} 기준`, scopeId: customer.id }
    : { prefix: 'AAC000001', prefixNote: '거래처코드 예시 AAC000001', scopeId: -1n }
}

export async function listNumberingRules(
  db: Db,
  operatorId: bigint,
  at = new Date(),
): Promise<NumberingRuleView[]> {
  const [rows, timeZone, issuedRows] = await Promise.all([
    db.numberingRule.findMany({
      where: { OR: [{ operatorId: null }, { operatorId }] },
      select: SPEC_SELECT,
    }),
    timeZoneOf(db, operatorId),
    db.numberingSeq.groupBy({ by: ['target'], where: { operatorId } }),
  ])
  const issued = new Set(issuedRows.map((r) => r.target))
  const views: NumberingRuleView[] = []
  for (const target of NUMBERING_TARGET.values) {
    const system = rows.find((r) => r.target === target && r.operatorId === null) as
      RuleRow | undefined
    if (!system) continue
    const own = rows.find((r) => r.target === target && r.operatorId === operatorId) as
      RuleRow | undefined
    const rule = toSpec(own ?? system)
    const sample = await samplePrefix(db, operatorId, rule.prefixSource, rule.fixedPrefix ?? '')
    // 초기화 주기별 다음 번호 (화면에서 주기를 바꿔 보면 미리보기가 따라 바뀐다)
    const keys = Object.fromEntries(
      RESET_CYCLE.values.map((cycle) => [cycle, periodKeyOf(cycle, at, timeZone)]),
    )
    const seqs = await db.numberingSeq.findMany({
      where: {
        operatorId,
        target,
        scopeId: sample.scopeId,
        periodKey: { in: Object.values(keys) },
      },
      select: { periodKey: true, lastSeq: true },
    })
    const nextByCycle = Object.fromEntries(
      RESET_CYCLE.values.map((cycle) => {
        const last = seqs.find((s) => s.periodKey === keys[cycle])?.lastSeq ?? 0n
        return [cycle, String(last + 1n)]
      }),
    )
    views.push({
      target,
      targetLabel: NUMBERING_TARGET.labels[target],
      rule,
      system: toSpec(system),
      overridden: Boolean(own),
      rowVersion: own?.rowVersion ?? null,
      sample: { prefix: sample.prefix, prefixNote: sample.prefixNote, nextByCycle },
      issued: issued.has(target),
      preview: previewCode(rule, sample.prefix, nextByCycle, at, timeZone),
      timeZone,
    })
  }
  return views
}

// ── 저장·되돌리기 (서버 액션 안 — 운영사는 출입증의 운영사)

// 화면 값 → 규칙 칸 (구조 칸은 시스템 기본에서)
function specOf(system: NumberingRuleSpec, data: NumberingRuleData): NumberingRuleSpec {
  return {
    ...system,
    fixedPrefix: system.prefixSource === 'FIXED' ? data.fixedPrefix : null,
    typeChar: data.typeChar || null,
    separator: data.separator || null,
    dateFormat: data.dateFormat,
    seqLength: data.seqLength,
    resetCycle: data.resetCycle,
  }
}

async function assertNoConflicts(db: Db, operatorId: bigint, rule: NumberingRuleSpec) {
  const conflicts = await findCodeConflicts(db, operatorId, rule)
  if (conflicts.length > 0) {
    throw new ActionError(
      'CONFLICT',
      `이 모양으로 바꾸면 앞으로 발급될 번호가 이미 있는 코드와 겹칩니다: ${conflicts.join(', ')}` +
        ' — 접두어·구분 문자·자리수를 다르게 하거나, 초기화 주기를 바꾼 경우 그 주기의 번호가 없을 때 바꿔 주세요.',
    )
  }
}

async function systemRule(db: Db, target: NumberingTarget) {
  const row = await db.numberingRule.findFirst({
    where: { target, operatorId: null },
    select: SPEC_SELECT,
  })
  if (!row) throw new ActionError('NOT_FOUND', '시스템 체번 규칙이 없습니다.')
  return toSpec(row as RuleRow)
}

// 저장: 운영사 행이 없으면 만들고, 있으면 버전을 검사해 고친다
export async function saveNumberingRule(data: NumberingRuleData, rowVersion: number | null) {
  const operatorId = requireOperatorId()
  return prisma.$transaction(async (tx) => {
    const system = await systemRule(tx, data.target)
    const issues = numberingRuleIssues(data, system.prefixSource)
    if (issues.length > 0) throw new ActionError('VALIDATION', issues[0].message)
    const rule = specOf(system, data)
    await assertNoConflicts(tx, operatorId, rule)
    const fields = {
      scope: rule.scope,
      prefixSource: rule.prefixSource,
      fixedPrefix: rule.fixedPrefix,
      typeChar: rule.typeChar,
      separator: rule.separator,
      dateFormat: rule.dateFormat,
      seqLength: rule.seqLength,
      resetCycle: rule.resetCycle,
    }
    const own = await tx.numberingRule.findFirst({
      where: { target: data.target, operatorId },
      select: { id: true, rowVersion: true },
    })
    if (!own) {
      if (rowVersion !== null) {
        throw new ActionError(
          'CONFLICT',
          '다른 사람이 먼저 기본으로 되돌렸습니다. 다시 열어 주세요.',
        )
      }
      const created = await tx.numberingRule.create({
        data: { ...fields, target: data.target, operatorId },
        select: { rowVersion: true },
      })
      return { rowVersion: created.rowVersion }
    }
    assertRowVersion(own, rowVersion ?? -1, '체번 규칙을 찾을 수 없습니다.')
    const updated = await withVersionGuard(() =>
      tx.numberingRule.update({
        where: { id: own.id, rowVersion: rowVersion ?? -1 },
        data: fields,
        select: { rowVersion: true },
      }),
    )
    return { rowVersion: updated.rowVersion }
  })
}

// 기본으로 되돌리기: 운영사 행을 지운다 (시스템 기본 모양으로도 겹침 검사)
export async function resetNumberingRule(target: NumberingTarget, rowVersion: number) {
  const operatorId = requireOperatorId()
  return prisma.$transaction(async (tx) => {
    const own = await tx.numberingRule.findFirst({
      where: { target, operatorId },
      select: { id: true, rowVersion: true },
    })
    assertRowVersion(own, rowVersion, '되돌릴 운영사 규칙이 없습니다.')
    await assertNoConflicts(tx, operatorId, await systemRule(tx, target))
    await tx.numberingRule.delete({ where: { id: own!.id } })
    return { reset: true }
  })
}
