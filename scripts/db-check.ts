// DB 연결 확인 스크립트: npm run db:check
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
  // 표가 없어도 실행되는 가장 단순한 질문으로 연결을 확인한다
  const rows = await prisma.$queryRaw<{ version: string; database: string }[]>`
    SELECT version() AS version, current_database() AS database
  `
  console.log(`DB 연결 성공: ${rows[0].database}`)
  console.log(rows[0].version)
}

main()
  .catch((error) => {
    console.error('DB 연결 실패:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
