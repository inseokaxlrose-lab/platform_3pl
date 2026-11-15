'use server'

import { z } from 'zod'
import { createAction } from '@/lib/actions/create-action'
import { clearActingOperatorCookie } from './acting-operator-cookie'

// 운영사 작업 끝내기 ([나가기], 0039): 전환 쿠키만 지운다
// 자기 브라우저의 상태만 바꾸고 데이터는 건드리지 않으므로 로그인만 확인한다
export const exitActingOperatorAction = createAction({
  permission: 'signed-in',
  input: z.object({}),
  handler: async () => {
    await clearActingOperatorCookie()
    return null
  },
})
