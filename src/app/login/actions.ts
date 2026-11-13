'use server'

import { APIError } from 'better-auth/api'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { ACCOUNT_DISABLED, auth } from '@/lib/auth'
import { safeNextPath } from '@/lib/redirect'

export type LoginState = { error?: string; username?: string }

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  next: z.string().optional(),
})

const userTypeSchema = z.enum(['OPERATOR', 'CENTER', 'SHIPPER'])

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

  let destination: string
  try {
    const result = await auth.api.signInUsername({
      body: { username, password },
      headers: await headers(),
    })
    const userType = userTypeSchema.parse((result?.user as { userType?: unknown })?.userType)
    destination = safeNextPath(next, userType)
  } catch (error) {
    if (error instanceof APIError && error.message === ACCOUNT_DISABLED) {
      return { error: '사용 중지된 계정입니다. 관리자에게 문의하세요.', username }
    }
    // 아이디와 비밀번호 중 무엇이 틀렸는지 알려주지 않는다 (아이디 존재 여부 노출 방지)
    return { error: '아이디 또는 비밀번호가 올바르지 않습니다.', username }
  }
  // redirect는 try 밖에서 (redirect는 내부적으로 예외를 던져 이동한다)
  redirect(destination)
}
