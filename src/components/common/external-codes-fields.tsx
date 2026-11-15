'use client'

import { Field } from '@/components/master-form/form-grid'
import { Input } from '@/components/ui/input'
import { EXTERNAL_SYSTEMS, EXTERNAL_SYSTEM_KEYS } from '@/config/external-systems'
import type { ExternalCodes } from '@/lib/master-code/external-codes-schema'

// 외부 코드 입력 (docs/decisions/0025): 연동 상대마다 한 칸 (12칸 격자에서 4칸씩)
// FormGrid 안에 넣는다. 비우면 그 연동 상대의 매핑이 지워진다
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
  return (
    <>
      {EXTERNAL_SYSTEM_KEYS.map((key) => (
        <Field
          key={key}
          span={4}
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
        </Field>
      ))}
    </>
  )
}
