import { codeSet } from '@/config/operator-codes'

// 거래처별 품목코드 값 목록 (docs/decisions/0098) — 상수 + DB 검사 조건
export const CUSTOMER_ITEM_STATUS = codeSet({ ACTIVE: '사용', INACTIVE: '사용 중지' })
