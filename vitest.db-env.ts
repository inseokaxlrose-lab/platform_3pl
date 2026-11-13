import 'dotenv/config'

// 테스트 DB 주소를 읽고 안전장치를 검사한다 (vitest.db-setup.ts, vitest.db-global-setup.ts 공용)
// 안전장치: DB 이름이 _test로 끝나지 않으면 실행을 거부한다 (개발·운영 DB 보호)
export function resolveTestDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL 환경변수가 없습니다. .env.example을 참고해 .env에 추가해 주세요.',
    )
  }
  const databaseName = new URL(testUrl).pathname.replace(/^\//, '')
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `테스트 DB 이름은 '_test'로 끝나야 합니다. 현재: '${databaseName}'. 개발 DB 보호를 위해 테스트를 중단합니다.`,
    )
  }
  return testUrl
}
