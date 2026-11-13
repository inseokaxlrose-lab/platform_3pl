import 'server-only'
import { z } from 'zod'
import type { PermissionCode } from '@/config/permissions'
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
  permission: PermissionCode
  // 입력 규칙
  input: TSchema
  // 실제 처리: 로그인·권한·입력 검사를 모두 통과해야 실행된다
  handler: (context: ActionContext<z.output<TSchema>>) => Promise<TData>
}

const MESSAGES = {
  UNAUTHENTICATED: '로그인이 필요합니다. 다시 로그인해 주세요.',
  FORBIDDEN: '이 작업을 할 권한이 없습니다.',
  VALIDATION: '입력값을 확인해 주세요.',
  UNKNOWN: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
} as const

// 서버 액션 공통 틀 — 데이터를 바꾸는 모든 서버 액션은 이것으로 만든다 (CLAUDE.md)
// 검사 순서: ① 로그인 → ② 권한 → ③ 입력 → ④ 처리
// 권한을 입력보다 먼저 검사한다: 권한 없는 사람에게 입력 규칙 힌트를 주지 않기 위해
export function createAction<TSchema extends z.ZodType, TData>({
  permission,
  input,
  handler,
}: CreateActionOptions<TSchema, TData>) {
  return async (rawInput: z.input<TSchema>): Promise<ActionResult<TData>> => {
    const user = await getCurrentUser()
    if (!user) return failure('UNAUTHENTICATED', MESSAGES.UNAUTHENTICATED)

    const permissions = await getCurrentPermissions()
    if (!permissions.has(permission)) return failure('FORBIDDEN', MESSAGES.FORBIDDEN)

    const parsed = input.safeParse(rawInput)
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error)
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: MESSAGES.VALIDATION,
          fieldErrors: fieldErrors as Record<string, string[]>,
        },
      }
    }

    try {
      const scope = await getCurrentScope()
      const data = await handler({ user, input: parsed.data, permissions, scope })
      return { ok: true, data }
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
