'use client'

import { Input } from '@/components/ui/input'
import { EXTERNAL_SYSTEMS, EXTERNAL_SYSTEM_KEYS } from '@/config/external-systems'
import type { ExternalCodes } from '@/lib/master-code/external-codes-schema'
import { FormField } from './form-field'
import { FormRow } from './form-layout'

// 외부 코드 입력 (docs/decisions/0025): 연동 상대마다 한 칸, 한 줄에 2칸씩
// 비우면 그 연동 상대의 매핑이 지워진다
export function ExternalCodesFields({
  value,
  onChange,
  disabled,
  errors = {},
  idPrefix,
}: {
  value: ExternalCodes
  onChange: (value: ExternalCodes) => void
  disabled?: boolean
  // 연동 상대 키 → 오류 문구
  errors?: Partial<Record<keyof ExternalCodes, string>>
  idPrefix: string
}) {
  // 2개씩 끊어서 한 줄로
  const rows: (typeof EXTERNAL_SYSTEM_KEYS)[] = []
  for (let i = 0; i < EXTERNAL_SYSTEM_KEYS.length; i += 2)
    rows.push(EXTERNAL_SYSTEM_KEYS.slice(i, i + 2))

  return (
    <>
      {rows.map((keys) => (
        <FormRow key={keys.join('-')}>
          {keys.map((key) => (
            <FormField
              key={key}
              label={`${EXTERNAL_SYSTEMS[key].label} 코드`}
              error={errors[key]}
              htmlFor={`${idPrefix}-external-${key}`}
            >
              <Input
                id={`${idPrefix}-external-${key}`}
                value={value[key]}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                disabled={disabled}
                placeholder="연동하지 않으면 비워 두세요"
                aria-invalid={Boolean(errors[key])}
              />
            </FormField>
          ))}
        </FormRow>
      ))}
    </>
  )
}
