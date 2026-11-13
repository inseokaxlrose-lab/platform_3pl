'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

// 로그아웃: 세션을 지우고 로그인 화면으로
export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() })
  redirect('/login')
}
