// 서버 액션 결과 타입 (서버·화면 공용)
// 서버 액션은 오류를 던지지 않고 결과로 돌려준다:
// Next.js는 운영 환경에서 서버 오류 메시지를 숨기므로, 던지면 화면에 정확한 안내를 할 수 없다

export type ActionErrorCode =
  | 'UNAUTHENTICATED' // 로그인 안 됨 (사용 중지 포함)
  | 'FORBIDDEN' // 권한 없음
  | 'VALIDATION' // 입력 오류
  | 'NOT_FOUND' // 대상 없음
  | 'CONFLICT' // 업무 규칙 위반 (예: 이미 마감된 ASN)
  | 'UNKNOWN' // 예상 못 한 오류 (자세한 내용은 서버 기록에만)

export type ActionFailure = {
  ok: false
  error: {
    code: ActionErrorCode
    message: string
    // 입력 칸별 오류 메시지 (VALIDATION일 때)
    fieldErrors?: Record<string, string[]>
  }
}

export type ActionResult<T> = { ok: true; data: T } | ActionFailure
