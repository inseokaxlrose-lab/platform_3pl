import { codeSet } from '@/config/operator-codes'

// 운송사·운송 계약·화주 발송인 값 목록 (docs/decisions/0094)
// 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건 (db-value-sets.db.test.ts가 같은지 확인)

// 운송 유형: 택배만 송장번호·계약 대역을 쓴다
export const CARRIER_TYPE = codeSet({
  PARCEL: '택배',
  FREIGHT: '화물',
  OWN: '자차',
  CHARTER: '용차',
})
export type CarrierType = (typeof CARRIER_TYPE.values)[number]

// 송장번호 체크디지트 규칙: NONE 검사 안 함 / MOD7 끝자리 = 앞자리 숫자를 7로 나눈 나머지
export const INVOICE_CHECK_RULE = codeSet({
  NONE: '없음',
  MOD7: '7로 나눈 나머지',
})
export type InvoiceCheckRule = (typeof INVOICE_CHECK_RULE.values)[number]

// 화주 송장의 보내는 주소: 출고 센터 / 화주 주소 / 직접 입력 (반품 회수지 겸용)
export const SENDER_ADDR_TYPE = codeSet({
  CENTER: '출고 센터 주소',
  SHIPPER: '화주사 주소',
  CUSTOM: '직접 입력',
})
export type SenderAddrType = (typeof SENDER_ADDR_TYPE.values)[number]

// 운송사·운송 계약 상태 (사용 / 사용 중지)
export const CARRIER_STATUS = codeSet({ ACTIVE: '사용', INACTIVE: '사용 중지' })
