'use client'

import { LogInIcon } from 'lucide-react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signInAction, type LoginState } from './actions'

// 로그인 입력 폼
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signInAction, {})

  return (
    <form action={formAction} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="grid gap-2">
        <Label htmlFor="username">아이디</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          required
          defaultValue={state.username}
          // 실패 후 다시 그릴 때 입력값을 유지하려고 key로 새로 만든다
          key={state.username}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        <LogInIcon />
        {pending ? '로그인 중…' : '로그인'}
      </Button>
    </form>
  )
}
