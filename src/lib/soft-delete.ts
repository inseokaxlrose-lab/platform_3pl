import { ActionError } from '@/lib/actions/action-error'

// 논리 삭제 되살리기 공통 규칙 (docs/decisions/0038)
// - 고른 것이 모두 "지운 것"이어야 한다 (하나라도 없으면 전체 거부)
// - 그 사이 같은 코드(이름)로 새로 만든 것이 있으면 되살리지 않는다 (코드는 삭제 안 된 것끼리 고유)

// 고른 수와 찾은(지운) 수가 다르면 거부
export function assertAllFound(found: number, wanted: number, noun: string) {
  if (found !== wanted) {
    throw new ActionError(
      'NOT_FOUND',
      `되살릴 수 없는 항목(${noun})이 섞여 있습니다. 목록을 새로 고쳐 주세요.`,
    )
  }
}

// 같은 코드가 이미 쓰이고 있으면 거부 (몇 개만 보여 준다)
export function assertNoCodeConflict(codes: string[], what: string) {
  if (codes.length === 0) return
  const shown = codes.slice(0, 5).join(', ') + (codes.length > 5 ? ` 외 ${codes.length - 5}개` : '')
  throw new ActionError(
    'CONFLICT',
    `같은 ${what}가 이미 다시 쓰이고 있어 되살릴 수 없습니다: ${shown}`,
  )
}
