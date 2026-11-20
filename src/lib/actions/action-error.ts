import type { ActionErrorCode } from './result'

// 처리 함수 안에서 던지는 업무 오류: 메시지가 그대로 사용자에게 보인다
// 예) throw new ActionError('CONFLICT', '이미 마감된 ASN입니다.')
// apiCode: 연동 API가 건별 오류로 돌려줄 코드 (docs/api-error-codes.md, 예: ITEM_STOCK_EXISTS) — 화면은 쓰지 않는다
export class ActionError extends Error {
  constructor(
    readonly code: Extract<ActionErrorCode, 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'VALIDATION'>,
    message: string,
    readonly apiCode?: string,
  ) {
    super(message)
    this.name = 'ActionError'
  }
}
