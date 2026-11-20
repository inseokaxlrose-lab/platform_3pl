'use client'

import { NumberInput } from '@/components/inputs'
import {
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormHeader,
} from '@/components/master-form'
import {
  OPERATOR_SETTINGS,
  operatorSettingsSchema,
  type OperatorSettingsInput,
} from '@/config/operator-settings'
import { saveOperatorSettingsAction } from './actions'

// 운영 설정 (docs/decisions/0092): 칸을 비우면 "사용 안 함"(기본값)
export function SettingsForm({
  header,
  initial,
  readOnly,
}: {
  header: MasterFormHeader
  initial: OperatorSettingsInput
  readOnly: boolean
}) {
  const form = useMasterForm({
    initial,
    schema: operatorSettingsSchema,
    save: (value: OperatorSettingsInput) => saveOperatorSettingsAction(value),
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const days = (key: keyof OperatorSettingsInput) => {
    const def = OPERATOR_SETTINGS[key]
    return (
      <Field
        label={def.label}
        span={6}
        error={errors[key]}
        htmlFor={`setting-${key}`}
        hint={`${def.description} 비우면 사용하지 않습니다.`}
      >
        <NumberInput
          id={`setting-${key}`}
          value={value[key] ?? null}
          onChange={(n) => set({ [key]: n } as Partial<OperatorSettingsInput>)}
          min={1}
          max={3650}
          unit={def.unit}
          disabled={disabled}
        />
      </Field>
    )
  }

  return (
    <MasterFormPage
      header={header}
      form={form}
      readOnly={readOnly}
      sections={[
        {
          id: 'stock',
          title: '재고',
          content: <FormGrid>{days('expiryAlertDays')}</FormGrid>,
        },
        {
          id: 'api',
          title: 'API 연동',
          content: <FormGrid>{days('apiKeyMaxDays')}</FormGrid>,
        },
      ]}
    />
  )
}
