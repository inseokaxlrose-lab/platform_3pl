import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { currentActor } from './actor'

// 앱 전체에서 DB 연결 통로(PrismaClient)를 하나만 쓰기 위한 파일
// 개발 모드에서는 코드를 고칠 때마다 모듈이 다시 불러와지므로,
// global에 보관해 두지 않으면 연결이 계속 새로 생겨 DB 연결 수가 바닥난다

// 공통 칸(등록·수정자, 버전)이 있는 표 (Prisma 모델 이름, docs/db-conventions.md)
export const AUDITED_MODELS: ReadonlySet<string> = new Set([
  'User',
  'PermissionGroup',
  'Center',
  'Warehouse',
  'Location',
  'Shipper',
  'Company',
  'CodeGroup',
  'CodeItem',
  'DeliveryZone',
  'Unit',
])

// 논리 삭제(del_yn)가 있는 표 (사용자는 계정을 지우지 않으므로 없음)
export const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set([
  'PermissionGroup',
  'Center',
  'Warehouse',
  'Location',
  'Shipper',
  'Company',
  'CodeGroup',
  'CodeItem',
  'DeliveryZone',
  'Unit',
])

type Data = Record<string, unknown>

// 조건에 del_yn을 직접 적었는지 (지운 것 보기·되살리기는 delYn: 'Y'를 직접 적는다)
function mentionsDelYn(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false
  return Object.entries(where as Data).some(
    ([key, value]) =>
      key === 'delYn' ||
      ((key === 'AND' || key === 'OR' || key === 'NOT') &&
        (Array.isArray(value) ? value.some(mentionsDelYn) : mentionsDelYn(value))),
  )
}

// 지운 줄 빼기: 조건에 delYn이 없으면 'N'(삭제 안 됨)만
// (include·select 안의 관계 목록과 _count는 여기서 거르지 못한다 → 그 자리에서 where: NOT_DELETED)
function notDeleted<T extends { where?: unknown }>(model: string, args: T): T {
  if (!SOFT_DELETE_MODELS.has(model) || mentionsDelYn(args.where)) return args
  return { ...args, where: { ...(args.where as Data | undefined), delYn: 'N' } }
}

// 등록: 등록·수정자를 지금 작업자로
const forCreate = (data: Data): Data => ({
  ...data,
  createdBy: currentActor(),
  updatedBy: currentActor(),
})

// 수정: 수정자를 지금 작업자로, 버전 +1 (동시 수정 막기)
const forUpdate = (data: Data): Data => ({
  ...data,
  updatedBy: currentActor(),
  rowVersion: { increment: 1 },
})

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL 환경변수가 없습니다. .env.example을 참고해 .env를 만들어 주세요.')
  }
  const adapter = new PrismaPg({ connectionString })
  // 공통 칸 자동 채우기: 화면·기능 코드에서 따로 넣지 않는다
  // (안쪽 관계로 함께 만드는 줄은 채워지지 않으므로, 공통 칸이 있는 표는 바깥에서 직접 만든다)
  return new PrismaClient({ adapter }).$extends({
    name: 'audit-columns',
    query: {
      $allModels: {
        // 읽기·수정·개수는 지운 줄을 빼고 (지운 것을 다루려면 조건에 delYn을 직접 적는다)
        findUnique({ model, args, query }) {
          return query(notDeleted(model, args))
        },
        findUniqueOrThrow({ model, args, query }) {
          return query(notDeleted(model, args))
        },
        findFirst({ model, args, query }) {
          return query(notDeleted(model, args))
        },
        findFirstOrThrow({ model, args, query }) {
          return query(notDeleted(model, args))
        },
        findMany({ model, args, query }) {
          return query(notDeleted(model, args))
        },
        count({ model, args, query }) {
          return query(notDeleted(model, args))
        },
        aggregate({ model, args, query }) {
          return query(notDeleted(model, args))
        },
        groupBy({ model, args, query }) {
          return query(notDeleted(model, args))
        },
        create({ model, args, query }) {
          if (AUDITED_MODELS.has(model)) args.data = forCreate(args.data as Data) as never
          return query(args)
        },
        createMany({ model, args, query }) {
          if (AUDITED_MODELS.has(model)) {
            const rows = Array.isArray(args.data) ? args.data : [args.data]
            args.data = rows.map((row) => forCreate(row as Data)) as never
          }
          return query(args)
        },
        update({ model, args, query }) {
          if (AUDITED_MODELS.has(model)) args.data = forUpdate(args.data as Data) as never
          return query(notDeleted(model, args))
        },
        updateMany({ model, args, query }) {
          if (AUDITED_MODELS.has(model)) args.data = forUpdate(args.data as Data) as never
          return query(notDeleted(model, args))
        },
        upsert({ model, args, query }) {
          if (AUDITED_MODELS.has(model)) {
            args.create = forCreate(args.create as Data) as never
            args.update = forUpdate(args.update as Data) as never
          }
          // 지운 줄은 찾지 않는다 → 없으면 새로 만든다 (부분 고유 조건과도 맞다)
          return query(notDeleted(model, args))
        },
      },
    },
  })
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// DB 연결 타입: 그냥 prisma 또는 트랜잭션 안의 tx (같은 함수를 둘 다에서 쓸 수 있게)
export type Tx = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>
export type Db = typeof prisma | Tx
