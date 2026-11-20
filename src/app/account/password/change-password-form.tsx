'use client'

import { KeyRoundIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_RULE_TEXT, type ChangePasswordInput } from '@/lib/users/user-schema'
import { changePasswordAction } from './actions'

type Key = keyof ChangePasswordInput

const FIELDS: { key: Key; label: string; autoComplete: string; hint?: string }[] = [
  { key: 'currentPassword', label: '현재 비밀번호', autoComplete: 'current-password' },
  {
    key: 'newPassword',
    label: '새 비밀번호',
    autoComplete: 'new-password',
    hint: PASSWORD_RULE_TEXT,
  },
  { key: 'newPasswordConfirm', label: '새 비밀번호 확인', autoComplete: 'new-password' },
]

// 본인 비밀번호 변경 입력 (0086): 바꾸면 자기 영역 홈으로 간다
export function ChangePasswordForm({ home }: { home: string }) {
  const router = useRouter()
  const [value, setValue] = useState<ChangePasswordInput>({
    currentPassword: '',
    newPassword: '',
    newPasswordConfirm: '',
  })
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await changePasswordAction(value)
      if (!result.ok) {
        // 칸 오류는 칸 아래에, 그 밖의 오류(현재 비밀번호 틀림 등)는 아래 문구로
        const fieldErrors = result.error.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
        setMessage(Object.keys(fieldErrors).length ? null : result.error.message)
        return
      }
      router.replace(home)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {FIELDS.map((field, index) => (
        <div key={field.key} className="grid gap-2">
          <Label htmlFor={field.key}>{field.label}</Label>
          <Input
            id={field.key}
            type="password"
            value={value[field.key]}
            onChange={(e) => setValue((v) => ({ ...v, [field.key]: e.target.value }))}
            autoComplete={field.autoComplete}
            autoFocus={index === 0}
            aria-invalid={Boolean(errors[field.key])}
            disabled={pending}
          />
          {errors[field.key] ? (
            <p className="text-xs text-destructive">{errors[field.key]}</p>
          ) : (
            field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>
          )}
        </div>
      ))}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        <KeyRoundIcon />
        {pending ? '바꾸는 중…' : '비밀번호 바꾸기'}
      </Button>
    </form>
  )
}
