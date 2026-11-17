// 플랫폼이 정하는 운영사 코드 값 (docs/specs/operator.md "3. 공통코드", docs/decisions/0040)
// 운영사마다 따로인 공통코드가 아니라 상수로 둔다: 운영사가 자기 유형·상태·요금제 값을 바꿀 수 없게, 또 프로그램이 값에 따라 동작을 바꾸므로
// DB 검사 조건(마이그레이션 _operator_spec)과 값 목록이 같아야 한다 — 값을 더하면 마이그레이션도 함께
// 운영사가 고치는 분류(담당 업무 CONTACT_ROLE·제공 서비스 SERVICE_TYPE)는 운영사 공통코드 (src/config/defaults/codes.ts)

// 값 → 화면 이름
type Labels<T extends string> = Readonly<Record<T, string>>

export function codeSet<const T extends string>(labels: Labels<T>) {
  const values = Object.keys(labels) as T[]
  return {
    values,
    labels,
    options: values.map((value) => ({ value, label: labels[value] })),
    // 목록에 있는 값인지 (입력·검색 조건 검사)
    has: (value: string | null | undefined): value is T =>
      value !== null && value !== undefined && values.includes(value as T),
  }
}

export const OPERATOR_TYPE = codeSet({
  '3PL': '3PL',
  FULFILLMENT: '풀필먼트',
  IN_HOUSE: '자가물류',
  FORWARDING: '포워딩',
  MIXED: '혼합',
})

export const OPERATOR_STATUS = codeSet({
  PENDING: '가입대기',
  ACTIVE: '운영중',
  SUSPENDED: '일시정지',
  TERMINATED: '해지',
})

export const BIZ_ENTITY = codeSet({ CORP: '법인', INDIVIDUAL: '개인' })
export const TAX_TYPE = codeSet({ GENERAL: '일반', SIMPLE: '간이', EXEMPT: '면세' })
export const PLAN = codeSet({
  TRIAL: 'TRIAL',
  BASIC: 'BASIC',
  STANDARD: 'STANDARD',
  ENTERPRISE: 'ENTERPRISE',
})
export const BILLING_BASIS = codeSet({ FIXED: '정액', USAGE: '건당', MIXED: '혼합' })
export const ALLOC_RULE = codeSet({ FIFO: 'FIFO', FEFO: 'FEFO', LIFO: 'LIFO' })
// 중량·길이 표시 단위는 단위 기준정보(tb_unit의 WEIGHT·LENGTH 단위)를 참조한다 (0078)
export const TEMP_ZONE = codeSet({
  AMBIENT: '상온',
  CHILLED: '냉장',
  FROZEN: '냉동',
  CONSTANT: '항온',
})
export type TempZoneKey = (typeof TEMP_ZONE.values)[number]

// 재고상태 (0074): 창고의 기본 재고상태. 재고 표 연결·할당 로직은 재고·출고 기능 때 (재고 기능과 공유)
export const STOCK_STATUS = codeSet({
  NORMAL: '정상',
  HOLD: '보류',
  DAMAGED: '불량',
  QUARANTINE: '격리',
})

// 정지·해지로 바꿀 때는 사유가 필수 (DB 검사 조건 tb_operator_status_reason_check)
export const STATUSES_NEEDING_REASON: readonly string[] = ['SUSPENDED', 'TERMINATED']
