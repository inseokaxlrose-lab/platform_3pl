import { prisma } from '@/lib/prisma'

// DB 테스트용: 모든 표를 비운다 (마이그레이션 기록 표는 제외)
// 테스트마다 깨끗한 상태에서 시작해, 앞 테스트의 데이터가 섞이지 않게 한다
export async function resetDatabase() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (rows.length === 0) return
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`)
}
