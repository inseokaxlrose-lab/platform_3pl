import { WarehouseIcon } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ThemeToggle } from '@/components/theme-toggle'
import { safeNextPath } from '@/lib/redirect'
import { getCurrentUser } from '@/lib/session'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: '로그인' }

// 로그인 화면 (이미 로그인했으면 바로 이동)
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams
  const nextPath = typeof next === 'string' ? next : undefined

  const user = await getCurrentUser()
  if (user) redirect(safeNextPath(nextPath, user.userType))

  return (
    <main className="relative flex flex-1 items-center justify-center bg-muted/40 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <WarehouseIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">3PL 관리 플랫폼</h1>
            <p className="text-sm text-muted-foreground">아이디와 비밀번호로 로그인하세요</p>
          </div>
        </div>
        <LoginForm next={nextPath} />
        <p className="text-center text-xs text-muted-foreground">
          계정이 없거나 비밀번호를 잊었다면 관리자에게 문의하세요.
        </p>
      </div>
    </main>
  )
}
