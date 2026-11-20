import 'server-only'
import { z } from 'zod'
import type { PermissionCode } from '@/config/permissions'
import { runInContext } from '@/lib/actor'
import { textIds, type WithTextIds } from '@/lib/id'
import type { DataScope } from '@/lib/scope/data-scope'
import {
  getCurrentPermissions,
  getCurrentScope,
  getCurrentUser,
  type CurrentUser,
} from '@/lib/session'
import { ActionError } from './action-error'
import type { ActionErrorCode, ActionFailure, ActionResult } from './result'

export type ActionContext<TInput> = {
  user: CurrentUser
  input: TInput
  permissions: ReadonlySet<PermissionCode>
  // 데이터 범위: 조회는 scopeFilter(scope, …), 한 건 수정·삭제는 assertInScope(scope, …)
  scope: DataScope
}

type CreateActionOptions<TSchema extends z.ZodType, TData> = {
  // 이 액션에 필요한 권한 (화면 버튼과 같은 코드)
  // 'signed-in': 메뉴 권한 없이 로그인만 필요 — 본인 것만 다루는 개인 설정용 (예: 그리드 설정)
  //   이 경우 handler는 반드시 context.user.id의 데이터만 다뤄야 한다 (0015)
  permission: PermissionCode | 'signed-in'
  // true면 임시 비밀번호 상태에서도 실행된다 — 비밀번호 변경·로그아웃처럼 그 상태를 벗어나는 액션만 (0086)
  allowWhilePasswordChange?: boolean
  // 입력 규칙
  input: TSchema
  // 실제 처리: 로그인·권한·입력 검사를 모두 통과해야 실행된다
  handler: (context: ActionContext<z.output<TSchema>>) => Promise<TData>
}

const MESSAGES = {
  UNAUTHENTICATED: '로그인이 필요합니다. 다시 로그인해 주세요.',
  FORBIDDEN: '이 작업을 할 권한이 없습니다.',
  PASSWORD_CHANGE: '임시 비밀번호입니다. 비밀번호를 먼저 바꿔 주세요.',
  VALIDATION: '입력값을 확인해 주세요.',
  UNKNOWN: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
} as const

// 서버 액션 공통 틀 — 데이터를 바꾸는 모든 서버 액션은 이것으로 만든다 (CLAUDE.md)
// 검사 순서: ① 로그인(+ 임시 비밀번호 상태) → ② 권한 → ③ 입력 → ④ 처리 → ⑤ 결과의 키(bigint)를 글자로
// 권한을 입력보다 먼저 검사한다: 권한 없는 사람에게 입력 규칙 힌트를 주지 않기 위해
export function createAction<TSchema extends z.ZodType, TData>({
  permission,
  allowWhilePasswordChange = false,
  input,
  handler,
}: CreateActionOptions<TSchema, TData>) {
  return async (rawInput: z.input<TSchema>): Promise<ActionResult<WithTextIds<TData>>> => {
    const user = await getCurrentUser()
    if (!user) return failure('UNAUTHENTICATED', MESSAGES.UNAUTHENTICATED)
    // 임시 비밀번호 상태: 화면은 변경 화면으로만 보내지만, 서버 액션을 직접 불러도 막는다 (0086)
    if (user.passwordChangeRequired && !allowWhilePasswordChange) {
      return failure('FORBIDDEN', MESSAGES.PASSWORD_CHANGE)
    }

    const permissions = await getCurrentPermissions()
    if (permission !== 'signed-in' && !permissions.has(permission)) {
      return failure('FORBIDDEN', MESSAGES.FORBIDDEN)
    }

    const parsed = input.safeParse(rawInput)
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: MESSAGES.VALIDATION,
          fieldErrors: toFieldErrors(parsed.error),
        },
      }
    }

    try {
      const scope = await getCurrentScope()
      // 처리 안의 DB 쓰기는 이 사용자가 한 것으로 기록된다 (등록·수정자 칸, 아이디는 소문자로 저장된 값)
      // 운영사 출입증: 처리 안의 운영사 표 읽기·쓰기는 이 사용자의 운영사로 자동으로 걸러지고 채워진다 (0039)
      const data = await runInContext(
        { actor: user.username.toLowerCase(), operatorId: scope.operatorId },
        () => handler({ user, input: parsed.data, permissions, scope }),
      )
      // 결과는 화면으로 가므로 안의 키(bigint)를 모두 글자로 바꾼다 (docs/db-conventions.md)
      return { ok: true, data: textIds(data) }
    } catch (error) {
      if (error instanceof ActionError) return failure(error.code, error.message)
      // 예상 못 한 오류: 자세한 내용은 서버 기록에만 남기고 사용자에게는 일반 문구
      console.error(`[action:${permission}]`, error)
      return failure('UNKNOWN', MESSAGES.UNKNOWN)
    }
  }
}

// 실패 결과 만들기
function failure(code: ActionErrorCode, message: string): ActionFailure {
  return { ok: false, error: { code, message } }
}

// 입력 오류 → 칸 위치별 문구 목록. 위치는 전체 경로 ('name', 'contacts.0.phone', 표 전체는 'contacts')
// 화면(useMasterForm)의 오류 위치와 같은 모양이라 1:N 표의 행·칸 오류까지 그대로 보인다
// 특정 칸이 아닌 전체 오류(경로 없음)는 빼고 공통 문구로만 알린다
function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const issue of error.issues) {
    if (issue.path.length === 0) continue
    const key = issue.path.join('.')
    ;(result[key] ??= []).push(issue.message)
  }
  return result
}
