import { execSync } from 'node:child_process'
import { resolveTestDatabaseUrl } from './vitest.db-env'

// DB 테스트 시작 전에 한 번 실행: 테스트 DB에 마이그레이션(표 구조)을 적용한다
export default function setup() {
  const testUrl = resolveTestDatabaseUrl()
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
  })
}
