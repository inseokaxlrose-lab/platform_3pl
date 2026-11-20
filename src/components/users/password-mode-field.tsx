'use client'

import { Field } from '@/components/master-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PasswordMode } from '@/lib/users/user-schema'

// 처음 비밀번호 정하는 방식 고르기 (0086): 자동 생성(기본) / 직접 입력
export const PASSWORD_MODE_LABELS: Record<PasswordMode, string> = {
  AUTO: '자동 생성 (권장)',
  MANUAL: '직접 입력',
}

export function PasswordModeField({
  id,
  value,
  onChange,
  disabled,
  span = 4,
}: {
  id: string
  value: PasswordMode
  onChange: (mode: PasswordMode) => void
  disabled?: boolean
  span?: 3 | 4 | 6 | 12
}) {
  return (
    <Field
      label="처음 비밀번호"
      span={span}
      htmlFor={id}
      hint={
        value === 'AUTO'
          ? '저장하면 임시 비밀번호를 한 번 보여 줍니다'
          : '사용자는 처음 로그인 때 바꿔야 합니다'
      }
    >
      <Select value={value} onValueChange={(v) => onChange(v as PasswordMode)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PASSWORD_MODE_LABELS) as PasswordMode[]).map((mode) => (
            <SelectItem key={mode} value={mode}>
              {PASSWORD_MODE_LABELS[mode]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
