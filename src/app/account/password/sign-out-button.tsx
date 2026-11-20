'use client'

import { LogOutIcon } from 'lucide-react'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/lib/auth-actions'

// 임시 비밀번호 상태에서 바꾸지 않고 나가기
export function SignOutButton() {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => signOutAction())}
    >
      <LogOutIcon />
      {pending ? '로그아웃 중…' : '로그아웃'}
    </Button>
  )
}
