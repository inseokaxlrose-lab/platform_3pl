import { redirect } from 'next/navigation'
import { homeOf } from '@/lib/redirect'
import { getCurrentUser } from '@/lib/session'

// 첫 화면: 로그인했으면 자기 영역 홈으로, 아니면 로그인 화면으로
export default async function RootPage() {
  const user = await getCurrentUser()
  redirect(user ? homeOf(user.userType) : '/login')
}
