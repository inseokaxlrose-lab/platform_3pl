import type { ActionResult } from './result'

// 화면용: 실패 결과를 오류로 바꾼다 (ConfirmDialog처럼 "실패 = 예외"를 기대하는 곳에서)
// 예) onConfirm={async (reason) => unwrap(await closeAsnAction({ asnId, reason }))}
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}
