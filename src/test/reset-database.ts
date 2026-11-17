import { prisma } from '@/lib/prisma'

// DB 테스트의 기본 운영사 (resetDatabase가 만든다. 표를 비울 때 번호를 1부터 다시 매기므로 항상 1)
export const TEST_OPERATOR_ID = 1n

// 시스템 기본 단위 (마이그레이션이 넣은 줄, 0078) — 표를 비워도 되살린다
// 처음 한 번 읽어 두고, 비운 뒤 같은 번호로 다시 넣는다 (마이그레이션이 유일한 출처)
let systemUnits: string | null = null

async function snapshotSystemUnits() {
  if (systemUnits !== null) return
  const [row] = await prisma.$queryRaw<{ rows: unknown }[]>`
    SELECT coalesce(json_agg(u), '[]'::json) AS rows FROM tb_unit u WHERE operator_id IS NULL
  `
  systemUnits = JSON.stringify(row.rows)
}

async function restoreSystemUnits() {
  await prisma.$executeRaw`
    INSERT INTO tb_unit SELECT * FROM json_populate_recordset(NULL::tb_unit, ${systemUnits}::json)
  `
  await prisma.$executeRaw`
    SELECT setval(pg_get_serial_sequence('tb_unit', 'unit_id'), coalesce((SELECT max(unit_id) FROM tb_unit), 0) + 1, false)
  `
}

// DB 테스트용: 모든 표를 비운다 (마이그레이션 기록 표는 제외, 시스템 기본 단위는 되살림)
// 테스트마다 깨끗한 상태에서 시작해, 앞 테스트의 데이터가 섞이지 않게 한다
// 비운 뒤 기본 운영사 하나를 만든다 (운영사 데이터는 모두 운영사에 속해야 하므로, 0039)
export async function resetDatabase() {
  await snapshotSystemUnits()
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (rows.length > 0) {
    const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ')
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`)
  }
  await restoreSystemUnits()
  await createTestOperator('테스트운영사', 'TEST')
}

// 운영사 (두 운영사 격리 테스트용으로 더 만들 수 있다). 운영사코드를 주지 않으면 T1, T2… 로 붙인다
let operatorSeq = 0
export function createTestOperator(name: string, code = `T${++operatorSeq}`) {
  return prisma.operator.create({ data: { code, name, businessNumber: '2208112341' } })
}
