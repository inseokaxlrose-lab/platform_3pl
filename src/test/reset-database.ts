import { prisma } from '@/lib/prisma'

// DB 테스트의 기본 운영사 (resetDatabase가 만든다. 표를 비울 때 번호를 1부터 다시 매기므로 항상 1)
export const TEST_OPERATOR_ID = 1n

// DB 테스트용: 모든 표를 비운다 (마이그레이션 기록 표는 제외)
// 테스트마다 깨끗한 상태에서 시작해, 앞 테스트의 데이터가 섞이지 않게 한다
// 비운 뒤 기본 운영사 하나를 만든다 (운영사 데이터는 모두 운영사에 속해야 하므로, 0039)
export async function resetDatabase() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (rows.length > 0) {
    const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ')
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`)
  }
  await createTestOperator('테스트운영사', 'TEST')
}

// 운영사 (두 운영사 격리 테스트용으로 더 만들 수 있다). 운영사코드를 주지 않으면 T1, T2… 로 붙인다
let operatorSeq = 0
export function createTestOperator(name: string, code = `T${++operatorSeq}`) {
  return prisma.operator.create({ data: { code, name, businessNumber: '2208112341' } })
}
