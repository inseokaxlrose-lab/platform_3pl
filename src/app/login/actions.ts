'use server'

import { APIError } from 'better-auth/api'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  ACCOUNT_DISABLED,
  ACCOUNT_LOCKED,
  auth,
  OPERATOR_DISABLED,
  SHIPPER_DISABLED,
} from '@/lib/auth'
import {
  checkLock,
  clientOf,
  LOCK_MINUTES,
  recordBlocked,
  recordFailure,
  recordSuccess,
} from '@/lib/users/login-guard'
import { safeNextPath } from '@/lib/redirect'

export type LoginState = { error?: string; username?: string }

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  next: z.string().optional(),
})

const userTypeSchema = z.enum(['OPERATOR', 'CENTER', 'SHIPPER', 'PLATFORM'])

// 로그인 서버 액션: 성공하면 원래 가려던 화면(또는 홈)으로 이동
export async function signInAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })
  if (!parsed.success) {
    return {
      error: '아이디와 비밀번호를 입력해 주세요.',
      username: String(formData.get('username') ?? ''),
    }
  }
  const { username, password, next } = parsed.data
  const requestHeaders = await headers()
  const client = clientOf(requestHeaders)
  const lockedMessage = (minutes: number) =>
    `로그인을 여러 번 실패해 잠겼습니다. ${minutes}분 뒤에 다시 시도하거나 관리자에게 문의하세요.`

  // 잠긴 계정은 비밀번호를 확인하지 않는다 (0093)
  const lockedFor = await checkLock(username, client)
  if (lockedFor !== null) return { error: lockedMessage(lockedFor), username }

  let destination: string
  try {
    const result = await auth.api.signInUsername({
      body: { username, password },
      headers: requestHeaders,
    })
    const signedIn = result?.user as { id?: string; userType?: unknown } | undefined
    const userType = userTypeSchema.parse(signedIn?.userType)
    await recordSuccess(BigInt(signedIn!.id!), username, client)
    destination = safeNextPath(next, userType)
  } catch (error) {
    if (error instanceof APIError && error.message === ACCOUNT_LOCKED) {
      await recordBlocked(username, 'LOCKED', client)
      return { error: lockedMessage(LOCK_MINUTES), username }
    }
    if (
      error instanceof APIError &&
      [ACCOUNT_DISABLED, OPERATOR_DISABLED, SHIPPER_DISABLED].includes(error.message)
    ) {
      await recordBlocked(username, 'DISABLED', client)
    }
    if (error instanceof APIError && error.message === ACCOUNT_DISABLED) {
      return { error: '사용 중지된 계정입니다. 관리자에게 문의하세요.', username }
    }
    if (error instanceof APIError && error.message === OPERATOR_DISABLED) {
      return {
        error: '소속 운영사의 이용이 중지되어 로그인할 수 없습니다. 관리자에게 문의하세요.',
        username,
      }
    }
    if (error instanceof APIError && error.message === SHIPPER_DISABLED) {
      return { error: '소속 화주사의 계약이 해지되어 로그인할 수 없습니다.', username }
    }
    // 아이디와 비밀번호 중 무엇이 틀렸는지 알려주지 않는다 (아이디 존재 여부 노출 방지)
    // 연속 실패가 쌓이면 잠근다 (5회 → 30분, 0093)
    if (await recordFailure(username, client)) {
      return { error: lockedMessage(LOCK_MINUTES), username }
    }
    return { error: '아이디 또는 비밀번호가 올바르지 않습니다.', username }
  }
  // redirect는 try 밖에서 (redirect는 내부적으로 예외를 던져 이동한다)
  redirect(destination)
}
