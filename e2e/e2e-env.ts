// 브라우저 테스트(e2e)용 DB 주소 (docs/decisions/0065)
// .env의 DATABASE_URL과 같은 서버, DB 이름만 뒤에 '_e2e'를 붙인다 (예: platform_3pl → platform_3pl_e2e)
// 주소는 화면·로그에 찍지 않는다
export function e2eDatabaseUrl(base = process.env.DATABASE_URL): string {
  if (!base) throw new Error('DATABASE_URL이 .env에 없습니다.')
  const url = new URL(base)
  const name = url.pathname.replace(/^\//, '')
  if (!name) throw new Error('DATABASE_URL에 DB 이름이 없습니다.')
  url.pathname = `/${name.endsWith('_e2e') ? name : `${name}_e2e`}`
  return url.toString()
}

// 견본 계정 (prisma/seed-samples.ts) — 비밀번호는 .env의 SEED_SAMPLE_PASSWORD
export const E2E_ACCOUNTS = {
  admin: 'ops.admin',
  shipper: 'shipper.user',
  manager: 'center.manager',
  worker: 'center.worker',
} as const

// 테스트용 품목·보관 로케이션 (e2e/setup-data.ts가 만든다)
export const E2E_ITEM = { code: 'E2E-WATER', name: 'E2E 생수' }
export const E2E_LOCATION = { warehouse: 'E2EGEN', code: 'E2E-01' }
