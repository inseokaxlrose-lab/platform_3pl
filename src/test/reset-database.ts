import { prisma } from '@/lib/prisma'

// DB 테스트의 기본 운영사 (resetDatabase가 만든다. 표를 비울 때 번호를 1부터 다시 매기므로 항상 1)
export const TEST_OPERATOR_ID = 1n

// 시스템 기준 행 (마이그레이션이 넣은 operator_id NULL 줄) — 표를 비워도 되살린다
// - tb_unit: 시스템 기본 단위 (0078)
// - tb_pallet_type: 시스템 팔레트 종류 T11·T12 (0083)
// 처음 한 번 읽어 두고, 비운 뒤 같은 번호로 다시 넣는다 (마이그레이션이 유일한 출처)
const SYSTEM_TABLES = [
  { table: 'tb_unit', idColumn: 'unit_id' },
  { table: 'tb_pallet_type', idColumn: 'pallet_type_id' },
] as const

let systemRows: Map<string, string> | null = null

async function snapshotSystemRows() {
  if (systemRows !== null) return
  systemRows = new Map()
  for (const { table } of SYSTEM_TABLES) {
    // 표 이름은 위 상수에서만 오므로 그대로 넣어도 안전하다
    const [row] = await prisma.$queryRawUnsafe<{ rows: unknown }[]>(
      `SELECT coalesce(json_agg(t), '[]'::json) AS rows FROM ${table} t WHERE operator_id IS NULL`,
    )
    systemRows.set(table, JSON.stringify(row.rows))
  }
}

async function restoreSystemRows() {
  for (const { table, idColumn } of SYSTEM_TABLES) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1::json)`,
      systemRows!.get(table),
    )
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', '${idColumn}'), coalesce((SELECT max(${idColumn}) FROM ${table}), 0) + 1, false)`,
    )
  }
}

// DB 테스트용: 모든 표를 비운다 (마이그레이션 기록 표는 제외, 시스템 기준 행은 되살림)
// 테스트마다 깨끗한 상태에서 시작해, 앞 테스트의 데이터가 섞이지 않게 한다
// 비운 뒤 기본 운영사 하나를 만든다 (운영사 데이터는 모두 운영사에 속해야 하므로, 0039)
export async function resetDatabase() {
  await snapshotSystemRows()
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (rows.length > 0) {
    const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ')
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`)
  }
  await restoreSystemRows()
  await createTestOperator('테스트운영사', 'TEST')
}

// 운영사 (두 운영사 격리 테스트용으로 더 만들 수 있다). 운영사코드를 주지 않으면 T1, T2… 로 붙인다
let operatorSeq = 0
export function createTestOperator(name: string, code = `T${++operatorSeq}`) {
  return prisma.operator.create({ data: { code, name, businessNumber: '2208112341' } })
}
