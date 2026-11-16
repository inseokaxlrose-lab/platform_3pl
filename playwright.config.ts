import { defineConfig } from '@playwright/test'
import 'dotenv/config'
import { e2eDatabaseUrl } from './e2e/e2e-env'

// 전체 흐름 브라우저 테스트 (docs/decisions/0065)
// - 앱은 e2e 전용 DB(DATABASE_URL의 DB 이름 + '_e2e', e2e/e2e-env.ts)로 따로 띄운다 (포트 3100) — 개발·테스트 DB를 건드리지 않는다
// - 브라우저는 이 컴퓨터에 설치된 Chrome을 쓴다 (Playwright 브라우저를 따로 내려받지 않는다)
// - 준비: npm run e2e:prepare (e2e DB 마이그레이션 + 시드 + 테스트용 품목·보관 로케이션)
// - 실행: npm run e2e

const port = 3100

export default defineConfig({
  testDir: './e2e',
  // 한 흐름이 앞 단계의 결과를 이어 쓰므로 차례대로
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `next dev --port ${port}`,
    url: `http://localhost:${port}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: e2eDatabaseUrl(),
      DIRECT_URL: e2eDatabaseUrl(),
      BETTER_AUTH_URL: `http://localhost:${port}`,
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
})
