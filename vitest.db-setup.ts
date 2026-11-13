import 'dotenv/config'

// DB 테스트 전용 준비 파일
// 테스트는 데이터를 지웠다 만들 수 있으므로, 개발 DB가 아닌 테스트 DB로 주소를 바꿔 끼운다
const testUrl = process.env.TEST_DATABASE_URL
if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL 환경변수가 없습니다. .env.example을 참고해 .env에 추가해 주세요.',
  )
}

// 안전장치: DB 이름이 _test로 끝나지 않으면 실행을 거부한다 (개발·운영 DB 보호)
const databaseName = new URL(testUrl).pathname.replace(/^\//, '')
if (!databaseName.endsWith('_test')) {
  throw new Error(
    `테스트 DB 이름은 '_test'로 끝나야 합니다. 현재: '${databaseName}'. 개발 DB 보호를 위해 테스트를 중단합니다.`,
  )
}

process.env.DATABASE_URL = testUrl
process.env.DIRECT_URL = testUrl
