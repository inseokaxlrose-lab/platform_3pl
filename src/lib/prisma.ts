import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { currentActor, currentOperatorId } from './actor'
import { assertStockWrite } from './stock/stock-write-guard'

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
  'Zone',
  'Shipper',
  'Operator',
  'CodeGroup',
  'CodeItem',
  'Unit',
  'OperatorUnit',
  'Item',
  'Customer',
  // 납품처 (0082)
  'ShipTo',
  'ItemUnit',
  'ItemBarcode',
  'PalletType',
  'NumberingRule',
  'Asn',
  'RegionCenterMap',
  // 화주 연동 API 키 (0081)
  'ApiClient',
  // 운송사·운송 계약 (0094)
  'Carrier',
  'CarrierContract',
  // 배송 코스 (0095)
  'Route',
])

// 등록·수정자만 있는 표 (버전 칸 없음): 담당자 표 4개 (0084 ④-3) — 버전은 부모(운영사·센터·화주사·거래처)에서 검사
export const STAMPED_MODELS: ReadonlySet<string> = new Set([
  'OperatorContact',
  'CenterContact',
  'ShipperContact',
  'CustomerContact',
])

// 논리 삭제(del_yn)가 있는 표 (사용자는 계정을 지우지 않으므로 없음)
export const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set([
  'PermissionGroup',
  'Center',
  'Warehouse',
  'Location',
  'Zone',
  'Shipper',
  'Operator',
  'CodeGroup',
  'CodeItem',
  'Unit',
  'Item',
  'Customer',
  'ShipTo',
  'PalletType',
  'Asn',
  // 운송사·운송 계약 (0094)
  'Carrier',
  'CarrierContract',
  // 배송 코스 (0095)
  'Route',
])

// 운영사 데이터가 들어가는 표 (operator_id가 있는 표, docs/decisions/0039)
// 서버 액션 안(운영사 출입증이 있을 때)에서는 읽기·수정·삭제에 이 운영사 조건이 자동으로 붙고, 등록에 운영사가 자동으로 채워진다
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  // 권역설정 (0076): 배정표·작업 단위·변경 이력
  'RegionCenterMap',
  'RegionChangeBatch',
  'RegionCenterMapHist',
  'User',
  'PermissionGroup',
  'Center',
  'Warehouse',
  'Location',
  'Zone',
  'Shipper',
  'ExternalCode',
  'CodeGroup',
  'CodeItem',
  'Unit',
  'OperatorUnit',
  'Item',
  'Customer',
  'ShipTo',
  'ItemBarcode',
  'PalletType',
  'NumberingRule',
  'Stock',
  'StockTxn',
  'Asn',
  'AsnLine',
  'InboundReceipt',
  'InboundReceiptLine',
  'InboundInspection',
  'InboundLabel',
  'Putaway',
  'StockAdjust',
  'StockAdjustLine',
  // 화주 연동 API (0081): 키·키 이력·요청 로그 (권한·IP·멱등·호출 한도 표는 키 번호로만 찾는다)
  'ApiClient',
  'ApiClientEvent',
  'ApiRequestLog',
  // 첨부파일 (0091)
  'File',
  'FileLink',
  // 운영사 설정 (0092)
  'OperatorSetting',
  // 운송사·운송 계약 (0094)
  'Carrier',
  'CarrierContract',
  // 배송 코스·코스 우편번호 (0095)
  'Route',
  'RouteZip',
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

// 시스템 줄(operator_id 비어 있음)을 모든 운영사가 함께 보는 표 (단위의 시스템 기본 단위, 0078)
// 읽을 때는 "시스템 + 지금 운영사", 고치거나 지울 때는 지금 운영사의 줄만 → 시스템 줄은 운영사가 고칠 수 없다
export const SHARED_SYSTEM_MODELS: ReadonlySet<string> = new Set([
  'Unit',
  'PalletType',
  // 체번 규칙 (0084): 시스템 기본 + 운영사 재정의
  'NumberingRule',
])

// 운영사 거르기: 서버 액션 안이면 지금 운영사의 줄만 (조건에 다른 운영사를 적어도 지금 운영사로 덮어쓴다 → 새지 않는 쪽으로)
// 서버 액션 밖(화면 조회 함수)은 데이터 범위 scopeFilter·isInScope가 운영사를 거른다
function inTenant<T extends { where?: unknown }>(
  model: string,
  args: T,
  mode: 'read' | 'write' = 'write',
): T {
  const operatorId = currentOperatorId()
  if (operatorId === undefined || !TENANT_MODELS.has(model)) return args
  const where = (args.where as Data | undefined) ?? {}
  if (mode === 'read' && SHARED_SYSTEM_MODELS.has(model)) {
    // 고유 조건(id 등)은 맨 바깥에 그대로 두고 AND로 더한다 (findUnique가 쓸 수 있게)
    const and = where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND]
    return {
      ...args,
      where: { ...where, AND: [...and, { OR: [{ operatorId: null }, { operatorId }] }] },
    }
  }
  return { ...args, where: { ...where, operatorId } }
}

// 읽기 조건: 지운 줄 빼기 + 운영사 거르기 (시스템 공유 줄 포함)
const scoped = <T extends { where?: unknown }>(model: string, args: T): T =>
  inTenant(model, notDeleted(model, args), 'read')
// 수정 조건: 지운 줄 빼기 + 지금 운영사의 줄만
const scopedWrite = <T extends { where?: unknown }>(model: string, args: T): T =>
  inTenant(model, notDeleted(model, args), 'write')

// 등록: 운영사를 지금 운영사로 채운다 (다른 운영사를 적었으면 개발 실수 → 오류)
function withOperator(model: string, data: Data): Data {
  const operatorId = currentOperatorId()
  if (operatorId === undefined || !TENANT_MODELS.has(model)) return data
  if (data.operatorId !== undefined && data.operatorId !== operatorId) {
    throw new Error(
      `[${model}] 지금 운영사(${operatorId})가 아닌 운영사의 데이터를 만들 수 없습니다.`,
    )
  }
  return { ...data, operatorId }
}

// 등록: 등록·수정자를 지금 작업자로, 운영사를 지금 운영사로
function forCreate(model: string, data: Data): Data {
  const withTenant = withOperator(model, data)
  if (!AUDITED_MODELS.has(model) && !STAMPED_MODELS.has(model)) return withTenant
  return { ...withTenant, createdBy: currentActor(), updatedBy: currentActor() }
}

// 수정: 수정자를 지금 작업자로, 버전 +1 (동시 수정 막기)
const forUpdate = (data: Data): Data => ({
  ...data,
  updatedBy: currentActor(),
  rowVersion: { increment: 1 },
})
// 버전 칸이 없는 표: 수정자만
const forStampUpdate = (data: Data): Data => ({ ...data, updatedBy: currentActor() })
const stampUpdate = (model: string, data: Data): Data =>
  AUDITED_MODELS.has(model)
    ? forUpdate(data)
    : STAMPED_MODELS.has(model)
      ? forStampUpdate(data)
      : data

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL 환경변수가 없습니다. .env.example을 참고해 .env를 만들어 주세요.')
  }
  const adapter = new PrismaPg({ connectionString })
  // 공통 칸 자동 채우기: 화면·기능 코드에서 따로 넣지 않는다
  // 재고 표 쓰기는 재고 변경 공통 함수 안에서만 (assertStockWrite, docs/decisions/0045)
  // (안쪽 관계로 함께 만드는 줄은 채워지지 않으므로, 공통 칸이 있는 표는 바깥에서 직접 만든다)
  return new PrismaClient({ adapter }).$extends({
    name: 'audit-tenant-columns',
    query: {
      $allModels: {
        // 읽기·수정·개수는 지운 줄을 빼고 (지운 것을 다루려면 조건에 delYn을 직접 적는다), 서버 액션 안이면 지금 운영사만
        findUnique({ model, args, query }) {
          return query(scoped(model, args))
        },
        findUniqueOrThrow({ model, args, query }) {
          return query(scoped(model, args))
        },
        findFirst({ model, args, query }) {
          return query(scoped(model, args))
        },
        findFirstOrThrow({ model, args, query }) {
          return query(scoped(model, args))
        },
        findMany({ model, args, query }) {
          return query(scoped(model, args))
        },
        count({ model, args, query }) {
          return query(scoped(model, args))
        },
        aggregate({ model, args, query }) {
          return query(scoped(model, args))
        },
        groupBy({ model, args, query }) {
          return query(scoped(model, args))
        },
        create({ model, args, query }) {
          assertStockWrite(model, 'create')
          args.data = forCreate(model, args.data as Data) as never
          return query(args)
        },
        createMany({ model, args, query }) {
          assertStockWrite(model, 'createMany')
          const rows = Array.isArray(args.data) ? args.data : [args.data]
          args.data = rows.map((row) => forCreate(model, row as Data)) as never
          return query(args)
        },
        // 실제 지우기(외부 코드 등 공통 칸이 없는 표)도 지금 운영사의 줄만
        delete({ model, args, query }) {
          assertStockWrite(model, 'delete')
          return query(inTenant(model, args))
        },
        deleteMany({ model, args, query }) {
          assertStockWrite(model, 'deleteMany')
          return query(inTenant(model, args))
        },
        update({ model, args, query }) {
          assertStockWrite(model, 'update')
          args.data = stampUpdate(model, args.data as Data) as never
          return query(scopedWrite(model, args))
        },
        updateMany({ model, args, query }) {
          assertStockWrite(model, 'updateMany')
          args.data = stampUpdate(model, args.data as Data) as never
          return query(scopedWrite(model, args))
        },
        // 아래 둘은 공통 칸·운영사 자동 채우기를 하지 않는다 (지금 쓰는 곳 없음). 재고 표만 막는다
        createManyAndReturn({ model, args, query }) {
          assertStockWrite(model, 'createManyAndReturn')
          return query(args)
        },
        updateManyAndReturn({ model, args, query }) {
          assertStockWrite(model, 'updateManyAndReturn')
          return query(args)
        },
        upsert({ model, args, query }) {
          assertStockWrite(model, 'upsert')
          args.create = forCreate(model, args.create as Data) as never
          args.update = stampUpdate(model, args.update as Data) as never
          // 지운 줄은 찾지 않는다 → 없으면 새로 만든다 (부분 고유 조건과도 맞다)
          return query(scopedWrite(model, args))
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
