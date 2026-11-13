// Prisma 명령어(migrate, studio 등)가 읽는 설정 파일
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // 개발용 시드 (server-only 모듈을 쓰므로 react-server 조건으로 실행)
    seed: 'tsx --conditions=react-server prisma/seed.ts',
  },
  datasource: {
    // 마이그레이션은 연결을 오래 붙잡고 작업하므로 "직접 주소"를 쓴다
    // (로컬에서는 DATABASE_URL과 같은 값, 클라우드로 옮기면 풀러를 거치지 않는 주소)
    url: env('DIRECT_URL'),
  },
})
