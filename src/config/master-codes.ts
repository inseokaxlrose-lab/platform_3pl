// 기준정보 코드 체계 설정 (docs/decisions/0025) — 화면·서버 공용
// 시스템 코드: 종류 접두어 + 0을 채운 일련번호 (종류별 DB 시퀀스, 절대 바뀌지 않음)

export const SYSTEM_CODE_TYPES = {
  CENTER: { prefix: 'CT', digits: 6, sequence: 'system_code_center_seq', label: '센터' },
  WAREHOUSE: { prefix: 'WH', digits: 6, sequence: 'system_code_warehouse_seq', label: '창고' },
  SHIPPER: { prefix: 'SH', digits: 6, sequence: 'system_code_shipper_seq', label: '화주사' },
  ITEM: { prefix: 'IT', digits: 8, sequence: 'system_code_item_seq', label: '품목' },
  CUSTOMER: { prefix: 'CU', digits: 8, sequence: 'system_code_customer_seq', label: '거래처' },
  DELIVERY_ZONE: {
    prefix: 'DZ',
    digits: 6,
    sequence: 'system_code_delivery_zone_seq',
    label: '배송권역',
  },
} as const

export type SystemCodeType = keyof typeof SYSTEM_CODE_TYPES

// 시스템 코드 모양 만들기: ('CENTER', 1) → 'CT000001'
export function formatSystemCode(type: SystemCodeType, sequence: number | bigint) {
  const { prefix, digits } = SYSTEM_CODE_TYPES[type]
  return `${prefix}${String(sequence).padStart(digits, '0')}`
}

// 사용자 코드 규칙: 영문 대문자·숫자·하이픈·밑줄 (입력은 소문자도 받아 대문자로 바꾼다)
export const USER_CODE_PATTERN = /^[A-Z0-9_-]+$/
