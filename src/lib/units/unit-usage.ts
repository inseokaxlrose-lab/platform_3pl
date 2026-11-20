import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { Db } from '@/lib/prisma'

// 단위가 어디서 쓰이는지 (docs/decisions/0078) — 삭제·소수 자리수 축소·사용 중지 경고가 함께 쓴다
// 새 업무 표(주문·출고 등)가 단위를 참조하게 되면 아래 목록에 한 줄씩 더한다 (화면·검사는 그대로)
// 운영사 범위: 시스템 단위는 모든 운영사가 쓰므로, 지금 운영사의 데이터만 센다

type UnitRef = { id: bigint; code: string }

type UsageCheck = {
  label: string
  // 단위마다 쓰이는 건수 (unit_id → 건수)
  count: (db: Db, operatorId: bigint, units: UnitRef[]) => Promise<Map<bigint, number>>
}

// SQL 결과 (unit_id, n) → Map
async function counted(db: Db, sql: Prisma.Sql) {
  const rows = await db.$queryRaw<{ unit_id: bigint; n: number }[]>(sql)
  return new Map(rows.map((r) => [r.unit_id, Number(r.n)]))
}

const ids = (units: UnitRef[]) => Prisma.join(units.map((u) => u.id))
const codes = (units: UnitRef[]) => Prisma.join(units.map((u) => u.code))

// 코드로 저장된 칸 (ASN·검수의 입력 단위)은 코드 → 단위 id로 되돌려 센다
const byCode = (label: string, table: string) =>
  ({
    label,
    count: async (db, operatorId, units) => {
      const rows = await db.$queryRaw<{ code: string; n: number }[]>(Prisma.sql`
        SELECT entry_unit_cd AS code, count(*)::int AS n FROM ${Prisma.raw(table)}
        WHERE operator_id = ${operatorId} AND entry_unit_cd IN (${codes(units)})
        GROUP BY entry_unit_cd`)
      const idOf = new Map(units.map((u) => [u.code, u.id]))
      return new Map(rows.map((r) => [idOf.get(r.code)!, Number(r.n)]))
    },
  }) satisfies UsageCheck

export const UNIT_USAGE_CHECKS: UsageCheck[] = [
  {
    label: '품목 기본단위',
    count: (db, operatorId, units) =>
      counted(
        db,
        Prisma.sql`SELECT base_unit_id AS unit_id, count(*)::int AS n FROM tb_item
          WHERE operator_id = ${operatorId} AND del_yn = 'N' AND base_unit_id IN (${ids(units)})
          GROUP BY base_unit_id`,
      ),
  },
  {
    label: '품목 환산단위',
    count: (db, operatorId, units) =>
      counted(
        db,
        Prisma.sql`SELECT iu.unit_id, count(*)::int AS n FROM tb_item_unit iu JOIN tb_item i ON i.item_id = iu.item_id
          WHERE i.operator_id = ${operatorId} AND i.del_yn = 'N' AND iu.unit_id IN (${ids(units)})
          GROUP BY iu.unit_id`,
      ),
  },
  {
    label: '운영사 중량·길이 단위',
    count: async (db, operatorId, units) => {
      const [row] = await db.$queryRaw<{ weight: bigint; length: bigint }[]>(Prisma.sql`
        SELECT weight_unit_id AS weight, length_unit_id AS length FROM tb_operator WHERE operator_id = ${operatorId}`)
      return new Map(
        units
          .filter((u) => row && (u.id === row.weight || u.id === row.length))
          .map((u) => [u.id, 1]),
      )
    },
  },
  byCode('ASN 입력 단위', 'tb_asn_line'),
  byCode('검수 입력 단위', 'tb_inbound_inspection'),
]

export type UnitUsage = { unitId: bigint; code: string; uses: { label: string; count: number }[] }

// 단위마다 쓰이는 곳 (쓰이지 않는 단위는 uses가 빈 목록)
export async function findUnitUsage(
  db: Db,
  operatorId: bigint,
  units: UnitRef[],
): Promise<UnitUsage[]> {
  if (units.length === 0) return []
  const results = await Promise.all(UNIT_USAGE_CHECKS.map((c) => c.count(db, operatorId, units)))
  return units.map((unit) => ({
    unitId: unit.id,
    code: unit.code,
    uses: UNIT_USAGE_CHECKS.flatMap((check, i) => {
      const count = results[i].get(unit.id) ?? 0
      return count > 0 ? [{ label: check.label, count }] : []
    }),
  }))
}

// "품목 기본단위 3건, ASN 입력 단위 1건"
export const usageText = (uses: { label: string; count: number }[]) =>
  uses.map((u) => `${u.label} ${u.count.toLocaleString()}건`).join(', ')

// 소수 자리수를 줄일 때: 이 단위가 기본단위인 품목의 수량 중 더 많은 소수 자리가 있는 칸
// (재고·재고 이력·ASN·검수·실사 수량은 모두 품목 기본단위로 저장된다)
// from: 수량 표 t와 품목 i를 잇는 부분 (실사 줄은 재고를 거쳐 품목으로)
const withItem = (table: string) => `${table} t JOIN tb_item i ON i.item_id = t.item_id`
const DECIMAL_COLUMNS: { label: string; from: string; columns: string[] }[] = [
  { label: '재고', from: withItem('tb_stock'), columns: ['stock_qty', 'alloc_qty'] },
  { label: '재고 이력', from: withItem('tb_stock_txn'), columns: ['chg_qty', 'after_qty'] },
  {
    label: 'ASN',
    from: withItem('tb_asn_line'),
    columns: ['expected_qty', 'confirmed_qty', 'putaway_qty', 'closed_qty'],
  },
  {
    label: '검수',
    from: withItem('tb_inbound_inspection'),
    columns: ['inspect_qty', 'defect_qty', 'confirmed_qty'],
  },
  {
    label: '실사·조정',
    from: 'tb_stock_adjust_line t JOIN tb_stock s ON s.stock_id = t.stock_id JOIN tb_item i ON i.item_id = s.item_id',
    columns: ['system_qty', 'counted_qty', 'chg_qty', 'applied_qty'],
  },
]

export async function findDecimalOverflow(
  db: Db,
  operatorId: bigint,
  unitId: bigint,
  decimals: number,
): Promise<string[]> {
  const found: string[] = []
  for (const { label, from, columns } of DECIMAL_COLUMNS) {
    const over = Prisma.raw(columns.map((c) => `t.${c} <> round(t.${c}, ${decimals})`).join(' OR '))
    const [row] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM ${Prisma.raw(from)}
      WHERE i.operator_id = ${operatorId} AND i.base_unit_id = ${unitId} AND (${over})`)
    if (row.n > 0) found.push(`${label} ${row.n.toLocaleString()}건`)
  }
  return found
}
