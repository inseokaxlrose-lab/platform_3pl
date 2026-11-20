import { ArrowLeftIcon, KeyRoundIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ThemeToggle } from '@/components/theme-toggle'
import { homeOf } from '@/lib/redirect'
import { getCurrentUser, PASSWORD_CHANGE_PATH } from '@/lib/session'
import { ChangePasswordForm } from './change-password-form'
import { SignOutButton } from './sign-out-button'

export const metadata: Metadata = { title: '비밀번호 변경' }

// 내 비밀번호 변경 (0086) — 운영사 화면·포털·플랫폼 공통
// 임시 비밀번호 상태면 여기로만 올 수 있다(requireUser가 보낸다). 그때는 [돌아가기] 대신 [로그아웃]
export default async function ChangePasswordPage() {
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(PASSWORD_CHANGE_PATH)}`)
  const forced = Boolean(user.passwordChangeRequired)
  const home = homeOf(user.userType)

  return (
    <main className="relative flex flex-1 items-center justify-center bg-muted/40 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KeyRoundIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">비밀번호 변경</h1>
            <p className="text-sm text-muted-foreground">
              {user.name} ({user.username})
            </p>
          </div>
        </div>
        {forced && (
          <p
            role="status"
            className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
          >
            관리자가 정한 임시 비밀번호로 로그인했습니다. 계속하려면 새 비밀번호로 바꿔 주세요.
          </p>
        )}
        <ChangePasswordForm home={home} />
        <div className="flex justify-center text-sm">
          {forced ? (
            <SignOutButton />
          ) : (
            <Link
              href={home}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" />
              돌아가기
            </Link>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          바꾸면 다른 기기에서 로그인한 것은 로그아웃됩니다.
        </p>
      </div>
    </main>
  )
}
