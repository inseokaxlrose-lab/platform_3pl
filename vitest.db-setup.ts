import { resolveTestDatabaseUrl } from './vitest.db-env'

// DB 테스트 파일마다 실행: 앱의 DB 주소를 테스트 DB로 바꿔 끼운다
const testUrl = resolveTestDatabaseUrl()
process.env.DATABASE_URL = testUrl
process.env.DIRECT_URL = testUrl
