import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { prisma } from '@/lib/prisma'
import { operatorFilter, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { EXTERNAL_SYSTEM_KEYS, isExternalSystemKey } from '@/config/external-systems'
import { saveExternalCodes } from './external-codes'
import { EMPTY_EXTERNAL_CODES, type ExternalCodes } from './external-codes-schema'
import type { ExternalTarget } from './external-code-targets'

// 외부코드 매핑 메뉴 (docs/decisions/0068): 대상 종류를 골라 한곳에서 SAP·ERP 코드를 본다·고친다
// 데이터 범위는 각 기준정보 목록과 같은 규칙 (센터 직원은 소속 센터 것만)

type Where = Record<string, unknown>

// 대상별 데이터 범위 (각 기준정보 화면의 규칙과 같게)
function targetScope(target: ExternalTarget, scope: DataScope): Where {
  switch (target) {
    case 'CENTER':
      return scopeFilter(scope, { center: 'id' })
    case 'WAREHOUSE':
    case 'ROUTE':
      return scopeFilter(scope, { center: 'centerId' })
    case 'SHIPPER':
      return scopeFilter(scope, { center: 'centers.some.centerId', shipper: 'id' })
    case 'ITEM':
    case 'CUSTOMER':
      return scopeFilter(scope, { center: 'shipper.centers.some.centerId', shipper: 'shipperId' })
    case 'UNIT':
    case 'CARRIER':
      return operatorFilter(scope)
  }
}

type FoundRow = { id: bigint; code: string; name: string; status: string; owner: string | null }
type FindArgs = { where: Where; orderBy: Where[]; skip: number; take: number }

const BASE = { id: true, code: true, name: true, status: true } as const
const withOwner = (row: { center?: { name: string }; shipper?: { name: string } }) =>
  row.center?.name ?? row.shipper?.name ?? null

// 대상 종류별 조회 (모델이 달라 종류마다 나눠 부른다, 모양은 같게 맞춘다)
async function findTargets(
  target: ExternalTarget,
  args: FindArgs,
): Promise<{ rows: FoundRow[]; rowCount: number }> {
  const { where } = args
  switch (target) {
    case 'CENTER': {
      const [rows, rowCount] = await prisma.$transaction([
        prisma.center.findMany({ ...args, select: BASE }),
        prisma.center.count({ where }),
      ])
      return { rows: rows.map((r) => ({ ...r, owner: null })), rowCount }
    }
    case 'WAREHOUSE': {
      const [rows, rowCount] = await prisma.$transaction([
        prisma.warehouse.findMany({
          ...args,
          select: { ...BASE, center: { select: { name: true } } },
        }),
        prisma.warehouse.count({ where }),
      ])
      return { rows: rows.map((r) => ({ ...r, owner: withOwner(r) })), rowCount }
    }
    case 'SHIPPER': {
      const [rows, rowCount] = await prisma.$transaction([
        prisma.shipper.findMany({ ...args, select: BASE }),
        prisma.shipper.count({ where }),
      ])
      return { rows: rows.map((r) => ({ ...r, owner: null })), rowCount }
    }
    case 'ITEM': {
      const [rows, rowCount] = await prisma.$transaction([
        prisma.item.findMany({ ...args, select: { ...BASE, shipper: { select: { name: true } } } }),
        prisma.item.count({ where }),
      ])
      return { rows: rows.map((r) => ({ ...r, owner: withOwner(r) })), rowCount }
    }
    case 'CUSTOMER': {
      const [rows, rowCount] = await prisma.$transaction([
        prisma.customer.findMany({
          ...args,
          select: { ...BASE, shipper: { select: { name: true } } },
        }),
        prisma.customer.count({ where }),
      ])
      return { rows: rows.map((r) => ({ ...r, owner: withOwner(r) })), rowCount }
    }
    case 'UNIT': {
      const [rows, rowCount] = await prisma.$transaction([
        prisma.unit.findMany({ ...args, select: BASE }),
        prisma.unit.count({ where }),
      ])
      return { rows: rows.map((r) => ({ ...r, owner: null })), rowCount }
    }
    case 'ROUTE': {
      const [rows, rowCount] = await prisma.$transaction([
        prisma.route.findMany({ ...args, select: { ...BASE, center: { select: { name: true } } } }),
        prisma.route.count({ where }),
      ])
      return { rows: rows.map((r) => ({ ...r, owner: withOwner(r) })), rowCount }
    }
    case 'CARRIER': {
      const [rows, rowCount] = await prisma.$transaction([
        prisma.carrier.findMany({ ...args, select: BASE }),
        prisma.carrier.count({ where }),
      ])
      return { rows: rows.map((r) => ({ ...r, owner: null })), rowCount }
    }
  }
}

// 매핑 상태 거르기: MAPPED = 외부코드가 하나라도 있음, UNMAPPED = 하나도 없음
async function mappingWhere(target: ExternalTarget, mapping: string | undefined): Promise<Where> {
  if (mapping !== 'MAPPED' && mapping !== 'UNMAPPED') return {}
  const mapped = await prisma.externalCode.findMany({
    where: { entityType: target },
    select: { entityId: true },
    distinct: ['entityId'],
  })
  const ids = mapped.map((m) => m.entityId)
  return mapping === 'MAPPED' ? { id: { in: ids } } : { id: { notIn: ids } }
}

// 한 번에 여러 대상의 외부코드 (목록용, 쿼리 1번)
async function codesFor(target: ExternalTarget, ids: bigint[]) {
  const rows = await prisma.externalCode.findMany({
    where: { entityType: target, entityId: { in: ids } },
    select: { entityId: true, system: true, code: true },
  })
  const byId = new Map<bigint, ExternalCodes>()
  for (const row of rows) {
    if (!isExternalSystemKey(row.system)) continue
    const codes = byId.get(row.entityId) ?? { ...EMPTY_EXTERNAL_CODES }
    codes[row.system] = row.code
    byId.set(row.entityId, codes)
  }
  return (id: bigint) => byId.get(id) ?? { ...EMPTY_EXTERNAL_CODES }
}

export type ExternalCodeListInput = {
  target: ExternalTarget
  mapping?: string
  // toPrismaQuery 결과 (검색어·정렬·페이지)
  query: { where: Where; orderBy: Where[]; skip: number; take: number }
  statusWhere: Where
}

// 목록: 대상 + 소속 + 외부코드
export async function listExternalCodeTargets(input: ExternalCodeListInput, scope: DataScope) {
  const where = {
    AND: [
      targetScope(input.target, scope),
      input.query.where,
      input.statusWhere,
      await mappingWhere(input.target, input.mapping),
    ],
  }
  const { rows, rowCount } = await findTargets(input.target, {
    where,
    orderBy: input.query.orderBy,
    skip: input.query.skip,
    take: input.query.take,
  })
  const codes = await codesFor(
    input.target,
    rows.map((r) => r.id),
  )
  return {
    rows: rows.map((row) => {
      const external = codes(row.id)
      return {
        ...row,
        externalCodes: external,
        mappedCount: EXTERNAL_SYSTEM_KEYS.filter((key) => external[key]).length,
      }
    }),
    rowCount,
  }
}

// 한 대상의 외부코드 저장: 볼 수 있는 대상인지 먼저 확인 (범위 밖·지운 것 → 찾을 수 없음)
export async function saveExternalCodeMapping(
  input: { target: ExternalTarget; id: bigint; codes: ExternalCodes },
  scope: DataScope,
) {
  const { rowCount } = await findTargets(input.target, {
    where: { AND: [{ id: input.id }, targetScope(input.target, scope)] },
    orderBy: [{ id: 'asc' }],
    skip: 0,
    take: 1,
  })
  if (rowCount === 0) throw new ActionError('NOT_FOUND', '대상을 찾을 수 없습니다.')
  await prisma.$transaction((tx) => saveExternalCodes(tx, input.target, input.id, input.codes))
  return { id: input.id }
}
