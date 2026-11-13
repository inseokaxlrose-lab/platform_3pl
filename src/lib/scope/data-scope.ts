import { ActionError } from '@/lib/actions/action-error'
import type { UserTypeValue } from '@/lib/redirect'

// 데이터 범위: 사용자가 "어떤 데이터를 볼 수 있나" (권한 = "무엇을 할 수 있나"와 별개)
// docs/decisions/0016-data-scope.md
export type DataScope =
  | { kind: 'ALL' } // 운영사: 전체
  | { kind: 'CENTERS'; centerIds: string[] } // 센터 직원: 소속 센터
  | { kind: 'SHIPPER'; shipperId: string } // 화주사 사용자: 자기 화주사
  | { kind: 'NONE' } // 아무것도 볼 수 없음 (소속이 없거나 사용 중지)

type ScopeInput = {
  userType: UserTypeValue
  isActive: boolean
  centers: { id: string; isActive: boolean }[]
  shipper: { id: string; isActive: boolean } | null
}

// 데이터 범위 계산: 애매하면 막는다 (소속 없는 센터 직원 = 전체가 아니라 NONE)
export function computeScope(input: ScopeInput): DataScope {
  if (!input.isActive) return { kind: 'NONE' }
  switch (input.userType) {
    case 'OPERATOR':
      return { kind: 'ALL' }
    case 'CENTER': {
      // 사용 중지된 센터는 범위에서 뺀다
      const centerIds = input.centers.filter((c) => c.isActive).map((c) => c.id)
      return centerIds.length > 0 ? { kind: 'CENTERS', centerIds } : { kind: 'NONE' }
    }
    case 'SHIPPER':
      return input.shipper?.isActive
        ? { kind: 'SHIPPER', shipperId: input.shipper.id }
        : { kind: 'NONE' }
  }
}

// 표에서 센터·화주사를 가리키는 칸 이름 (관계를 거치면 점으로: 'warehouse.centerId')
export type ScopeFields = { center?: string; shipper?: string }

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

// 목록 조회용 조건: prisma.xxx.findMany({ where: { ...scopeFilter(scope, fields), ...검색조건 } })
export function scopeFilter(scope: DataScope, fields: ScopeFields): Record<string, unknown> {
  switch (scope.kind) {
    case 'ALL':
      return {}
    case 'CENTERS':
      if (!fields.center) throw new ScopeFieldMissingError(scope.kind)
      return nested(fields.center, { in: scope.centerIds })
    case 'SHIPPER':
      if (!fields.shipper) throw new ScopeFieldMissingError(scope.kind)
      return nested(fields.shipper, scope.shipperId)
    case 'NONE': {
      // 결과가 항상 0건인 조건 (in: [])
      const field = fields.center ?? fields.shipper
      if (!field) throw new ScopeFieldMissingError(scope.kind)
      return nested(field, { in: [] })
    }
  }
}

// 'warehouse.centerId' 경로로 값 꺼내기
function readPath(record: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((value, key) => (value as Record<string, unknown> | null)?.[key], record)
}

// 한 건이 범위 안인지
export function isInScope(scope: DataScope, record: unknown, fields: ScopeFields): boolean {
  switch (scope.kind) {
    case 'ALL':
      return true
    case 'NONE':
      return false
    case 'CENTERS':
      if (!fields.center) throw new ScopeFieldMissingError(scope.kind)
      return scope.centerIds.includes(readPath(record, fields.center) as string)
    case 'SHIPPER':
      if (!fields.shipper) throw new ScopeFieldMissingError(scope.kind)
      return readPath(record, fields.shipper) === scope.shipperId
  }
}

// 한 건 수정·삭제 전 검사: 범위 밖이면 "찾을 수 없음" (존재 여부도 알려주지 않는다)
export function assertInScope(scope: DataScope, record: unknown, fields: ScopeFields) {
  if (record === null || record === undefined || !isInScope(scope, record, fields)) {
    throw new ActionError('NOT_FOUND', '대상을 찾을 수 없습니다.')
  }
}
