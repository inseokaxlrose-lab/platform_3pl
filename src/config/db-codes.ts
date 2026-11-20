// 프로그램이 값에 따라 동작을 바꾸는 값 목록 중, 업무 화면 상수 파일에 자리가 없던 것 (docs/decisions/0084 ④-2)
// DB 검사 조건(CHECK)과 같아야 한다 — src/config/db-value-sets.db.test.ts가 확인한다

// 사용자 유형 (tb_user.user_type_cd) — 화면에서 만드는 유형은 USER_TYPES(PLATFORM 제외, users/user-schema)
export const USER_TYPE_VALUES = ['OPERATOR', 'CENTER', 'SHIPPER', 'PLATFORM'] as const

// 사용자별 권한 덮어쓰기 (tb_user_perm_override.effect_cd): GRANT 추가 / DENY 제외
export const PERMISSION_EFFECT_VALUES = ['GRANT', 'DENY'] as const

// 외부 코드 매핑 대상 종류 (tb_ext_code.entity_type_cd) — 화면에서 고르는 대상은 EXTERNAL_TARGETS(LOCATION은 아직 연동 대상 아님)
export const EXTERNAL_ENTITY_TYPE_VALUES = [
  'CENTER',
  'WAREHOUSE',
  'LOCATION',
  'SHIPPER',
  'ITEM',
  'CUSTOMER',
  'UNIT',
  // 운송사 (0094)
  'CARRIER',
] as const
export type ExternalEntityType = (typeof EXTERNAL_ENTITY_TYPE_VALUES)[number]

// 로그인 이력 결과 (tb_login_hist.result_cd, 0093): 성공 / 비밀번호 틀림 / 잠겨서 막힘 / 사용 중지·운영사 중지로 막힘
export const LOGIN_RESULT_VALUES = ['SUCCESS', 'FAIL', 'LOCKED', 'DISABLED'] as const
export type LoginResult = (typeof LOGIN_RESULT_VALUES)[number]

// API 키 이력 (tb_api_client_event.event_cd)
export const API_KEY_EVENT_VALUES = ['ISSUED', 'UPDATED', 'REVOKED', 'EXPIRED'] as const

// API 요청 건별 결과 (tb_api_request_item.result_cd)
export const API_ITEM_RESULT_VALUES = [
  'CREATED',
  'UPDATED',
  'UNCHANGED',
  'DUPLICATE',
  'FAIL',
] as const

// 보세 구분 (tb_center.bonded_type_cd)
export const BONDED_TYPE_VALUES = [
  'BW_COMMERCIAL',
  'BW_PRIVATE',
  'BONDED_FACTORY',
  'GENERAL_BONDED',
  'FTZ',
] as const

// 체번 구분자 (tb_numbering_rule.separator)
export const NUMBERING_SEPARATOR_VALUES = ['-', '_'] as const

// 우편번호 데이터 적재 이력 (tb_region_load_hist)
export const REGION_LOAD_TYPE_VALUES = ['FULL', 'DELTA'] as const
export const REGION_LOAD_STATUS_VALUES = ['RUNNING', 'DONE', 'FAILED'] as const

// 납품처 배송센터를 찾은 단계 (tb_ship_to.resolve_level_cd)
export const RESOLVE_LEVEL_VALUES = ['ZIP', 'BJD', 'SIGUNGU'] as const

// 사유 코드의 귀책 (tb_code_item.fault_party_cd) — 표시·집계용, 공통코드 그룹이 fault_party_yn='Y'일 때만 (0087)
export const FAULT_PARTY_LABELS = {
  SHIPPER: '화주',
  CENTER: '센터',
  CARRIER: '운송사',
  ETC: '기타',
} as const
export type FaultParty = keyof typeof FAULT_PARTY_LABELS
export const FAULT_PARTY_VALUES = Object.keys(FAULT_PARTY_LABELS) as FaultParty[]
