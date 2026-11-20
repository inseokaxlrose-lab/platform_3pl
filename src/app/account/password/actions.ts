'use server'

import { createAction } from '@/lib/actions/create-action'
import { ActionError } from '@/lib/actions/action-error'
import { getCurrentSessionId } from '@/lib/session'
import { changeOwnPassword } from '@/lib/users/manage-user'
import { changePasswordSchema } from '@/lib/users/user-schema'

// 본인 비밀번호 변경 (0086): 로그인만 필요(본인 것만 바꾼다), 임시 비밀번호 상태에서도 실행된다
export const changePasswordAction = createAction({
  permission: 'signed-in',
  allowWhilePasswordChange: true,
  input: changePasswordSchema,
  handler: async ({ user, input }) => {
    const sessionId = await getCurrentSessionId()
    if (!sessionId) throw new ActionError('FORBIDDEN', '로그인이 필요합니다. 다시 로그인해 주세요.')
    await changeOwnPassword(user.id, sessionId, input.currentPassword, input.newPassword)
    return { id: user.id }
  },
})
