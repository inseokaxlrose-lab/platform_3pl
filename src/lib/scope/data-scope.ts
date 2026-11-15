import { ActionError } from '@/lib/actions/action-error'
import type { UserTypeValue } from '@/lib/redirect'

// 데이터 범위: 사용자가 "어떤 데이터를 볼 수 있나" (권한 = "무엇을 할 수 있나"와 별개)
// docs/decisions/0016-data-scope.md
// 모든 범위는 운영사 안에서만이다 (operatorId, 멀티테넌트 docs/decisions/0039)
// → 운영사 관리자의 "전체"도 자기 운영사 전체. 목록·한 건 검사에 운영사 조건이 자동으로 붙는다
export type DataScope =
  | { kind: 'ALL'; operatorId: bigint } // 운영사 관리자: 자기 운영사 전체
  | { kind: 'CENTERS'; operatorId: bigint; centerIds: bigint[] } // 센터 직원: 소속 센터
  | { kind: 'SHIPPER'; operatorId: bigint; shipperId: bigint } // 화주사 사용자: 자기 화주사
  // 아무것도 볼 수 없음 (소속이 없거나 사용 중지, 로그인 안 됨). 사용자가 있으면 그 운영사는 기억한다 (서버 액션 출입증용)
  | { kind: 'NONE'; operatorId?: bigint }

type ScopeInput = {
  // 플랫폼 관리자는 운영사가 없다 (null → NONE. 운영사로 작업할 때의 범위는 session.ts가 정한다)
  operatorId: bigint | null
  userType: UserTypeValue
  isActive: boolean
  centers: { id: bigint; isActive: boolean }[]
  shipper: { id: bigint; isActive: boolean } | null
}

// 데이터 범위 계산: 애매하면 막는다 (소속 없는 센터 직원 = 전체가 아니라 NONE)
export function computeScope(input: ScopeInput): DataScope {
  const { operatorId } = input
  if (operatorId === null || input.userType === 'PLATFORM') return { kind: 'NONE' }
  if (!input.isActive) return { kind: 'NONE', operatorId }
  switch (input.userType) {
    case 'OPERATOR':
      return { kind: 'ALL', operatorId }
    case 'CENTER': {
      // 사용 중지된 센터는 범위에서 뺀다
      const centerIds = input.centers.filter((c) => c.isActive).map((c) => c.id)
      return centerIds.length > 0
        ? { kind: 'CENTERS', operatorId, centerIds }
        : { kind: 'NONE', operatorId }
    }
    case 'SHIPPER':
      return input.shipper?.isActive
        ? { kind: 'SHIPPER', operatorId, shipperId: input.shipper.id }
        : { kind: 'NONE', operatorId }
  }
}

// 표에서 센터·화주사를 가리키는 칸 이름 (관계를 거치면 점으로: 'warehouse.centerId')
// 여러 개와 연결된 관계는 'some'으로: 'centers.some.centerId' = 연결된 센터 중 하나라도 (화주사의 이용 센터)
// operator: 운영사 칸 (기본 'operatorId' — 운영사 표는 모두 이 칸을 직접 갖는다)
export type ScopeFields = { center?: string; shipper?: string; operator?: string }

const operatorPath = (fields: ScopeFields) => fields.operator ?? 'operatorId'

// 개발 실수: 범위에 필요한 칸을 지정하지 않음 → 조건 없이 조회되는 사고를 막기 위해 오류
export class ScopeFieldMissingError extends Error {
  constructor(kind: DataScope['kind']) {
    super(
      `데이터 범위(${kind})를 적용할 칸이 지정되지 않았습니다. scopeFilter의 fields를 확인하세요.`,
    )
    this.name = 'ScopeFieldMissingError'
  }
}

// 'warehouse.centerId' + 조건 → { warehouse: { centerId: 조건 } }
function nested(path: string, condition: unknown): Record<string, unknown> {
  return path
    .split('.')
    .reduceRight<unknown>((inner, key) => ({ [key]: inner }), condition) as Record<string, unknown>
}

// 두 조건 합치기: 같은 관계 경로는 안쪽까지 합친다 ({ center: { a } } + { center: { b } } → { center: { a, b } })
function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const result = { ...a }
  for (const [key, value] of Object.entries(b)) {
    const current = result[key]
    const bothObjects = current && value && typeof current === 'object' && typeof value === 'object'
    result[key] = bothObjects
      ? merge(current as Record<string, unknown>, value as Record<string, unknown>)
      : value
  }
  return result
}

// 목록 조회용 조건: prisma.xxx.findMany({ where: { ...scopeFilter(scope, fields), ...검색조건 } })
// 운영사 조건(항상) + 센터·화주사 조건
export function scopeFilter(scope: DataScope, fields: ScopeFields): Record<string, unknown> {
  if (scope.kind === 'NONE') {
    // 결과가 항상 0건인 조건 (in: [])
    return nested(fields.center ?? fields.shipper ?? operatorPath(fields), { in: [] })
  }
  const operator = nested(operatorPath(fields), scope.operatorId)
  switch (scope.kind) {
    case 'ALL':
      return operator
    case 'CENTERS':
      if (!fields.center) throw new ScopeFieldMissingError(scope.kind)
      return merge(operator, nested(fields.center, { in: scope.centerIds }))
    case 'SHIPPER':
      if (!fields.shipper) throw new ScopeFieldMissingError(scope.kind)
      return merge(operator, nested(fields.shipper, scope.shipperId))
  }
}

// 'warehouse.centerId' 경로로 값들 꺼내기 ('some'을 만나면 목록의 모든 항목에서 이어서 꺼낸다)
function readPath(record: unknown, path: string): unknown[] {
  return path
    .split('.')
    .reduce<unknown[]>(
      (values, key) =>
        key === 'some'
          ? values.flatMap((value) => (Array.isArray(value) ? value : []))
          : values.map((value) => (value as Record<string, unknown> | null)?.[key]),
      [record],
    )
}

// 한 건이 범위 안인지: 먼저 같은 운영사인지 (운영사 칸을 select하지 않았으면 범위 밖으로 본다 → 막는 쪽)
export function isInScope(scope: DataScope, record: unknown, fields: ScopeFields): boolean {
  if (scope.kind === 'NONE') return false
  if (!readPath(record, operatorPath(fields)).includes(scope.operatorId)) return false
  switch (scope.kind) {
    case 'ALL':
      return true
    case 'CENTERS':
      if (!fields.center) throw new ScopeFieldMissingError(scope.kind)
      return readPath(record, fields.center).some((id) => scope.centerIds.includes(id as bigint))
    case 'SHIPPER':
      if (!fields.shipper) throw new ScopeFieldMissingError(scope.kind)
      return readPath(record, fields.shipper).includes(scope.shipperId)
  }
}

// 한 건 수정·삭제 전 검사: 범위 밖이면 "찾을 수 없음" (존재 여부도 알려주지 않는다)
export function assertInScope(scope: DataScope, record: unknown, fields: ScopeFields) {
  if (record === null || record === undefined || !isInScope(scope, record, fields)) {
    throw new ActionError('NOT_FOUND', '대상을 찾을 수 없습니다.')
  }
}

// 운영사 조건만: 센터·화주사로 나누지 않는 운영사 공통 데이터 (단위·공통코드·권한그룹·사용자 등, 0039)
// 볼 수 없는 사용자(NONE)는 0건
export function operatorFilter(scope: DataScope): { operatorId: bigint | { in: bigint[] } } {
  return scope.kind === 'NONE' ? { operatorId: { in: [] } } : { operatorId: scope.operatorId }
}
