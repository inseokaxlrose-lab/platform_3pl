import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

// 앱 전체에서 DB 연결 통로(PrismaClient)를 하나만 쓰기 위한 파일
// 개발 모드에서는 코드를 고칠 때마다 모듈이 다시 불러와지므로,
// global에 보관해 두지 않으면 연결이 계속 새로 생겨 DB 연결 수가 바닥난다

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL 환경변수가 없습니다. .env.example을 참고해 .env를 만들어 주세요.')
  }
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
