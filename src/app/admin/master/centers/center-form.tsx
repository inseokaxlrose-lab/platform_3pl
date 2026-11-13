'use client'

import { PowerIcon, SaveIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  AddressFields,
  ConfirmDialog,
  ExternalCodesFields,
  FormColumns,
  FormField,
  FormRow,
  FormSection,
  StatusBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { unwrap } from '@/lib/actions'
import { centerSchema, type CenterInput } from '@/lib/centers/center-schema'
import { EMPTY_EXTERNAL_CODES } from '@/lib/master-code/external-codes-schema'
import { createCenterAction, setCenterActiveAction, updateCenterAction } from './actions'
import type { CenterForEdit } from './queries'
import { WarehouseSummary } from './warehouse-summary'

const LIST_HREF = '/admin/master/centers'

const EMPTY: CenterInput = {
  code: '',
  name: '',
  phone: '',
  fax: '',
  managerName: '',
  managerPhone: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  externalCodes: { ...EMPTY_EXTERNAL_CODES },
}

type CenterFormProps = {
  // 없으면 등록
  center?: CenterForEdit
  // 수정(또는 등록) 권한이 없으면 읽기 전용
  readOnly: boolean
  // 사용 중지/다시 사용 가능 여부 (운영사 + 수정 권한)
  canToggleActive?: boolean
  // 창고 요약: 조회 권한이면 창고로 이동, 등록 권한이면 [창고 추가]
  warehouseAccess?: { canView: boolean; canAdd: boolean }
}

// 오류 위치 → 문구 ('code', 'externalCodes.SAP' …)
type Errors = Record<string, string>

// 센터 등록·수정 폼 (docs/decisions/0026)
// 입력은 왼쪽 단에 다 담긴다. 수정 화면에서는 오른쪽에 창고 요약(읽기 전용)을 보여준다
export function CenterForm({
  center,
  readOnly,
  canToggleActive = false,
  warehouseAccess = { canView: false, canAdd: false },
}: CenterFormProps) {
  const router = useRouter()
  const isNew = !center
  const [form, setForm] = useState<CenterInput>(center?.input ?? EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const disabled = readOnly || pending
  const set = (patch: Partial<CenterInput>) => setForm((previous) => ({ ...previous, ...patch }))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setMessage(null)
    // 저장 전에 화면에서 같은 규칙으로 먼저 검사 (칸별 오류)
    const parsed = centerSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      )
      return
    }
    setErrors({})
    startTransition(async () => {
      const result = isNew
        ? await createCenterAction(form)
        : await updateCenterAction({ id: center.id, ...form })
      if (!result.ok) {
        setMessage(result.error.message)
        return
      }
      router.push(isNew ? `${LIST_HREF}/${result.data.id}` : LIST_HREF)
      router.refresh()
    })
  }

  const text = (
    key: 'code' | 'name' | 'phone' | 'fax' | 'managerName' | 'managerPhone',
    label: string,
    options: { required?: boolean; placeholder?: string; inputMode?: 'tel' } = {},
  ) => (
    <FormField
      label={label}
      required={options.required}
      error={errors[key]}
      htmlFor={`center-${key}`}
    >
      <Input
        id={`center-${key}`}
        value={form[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        disabled={disabled}
        placeholder={options.placeholder}
        inputMode={options.inputMode}
        aria-invalid={Boolean(errors[key])}
      />
    </FormField>
  )

  const left = (
    <>
      <FormSection title="기본 정보">
        <FormRow>
          <FormField label="시스템 코드" htmlFor="center-system-code">
            <Input
              id="center-system-code"
              value={center?.systemCode ?? '저장하면 자동으로 부여됩니다'}
              disabled
              readOnly
            />
          </FormField>
          {text('code', '센터 코드', { placeholder: '비우면 시스템 코드 사용' })}
        </FormRow>
        {text('name', '센터명', { required: true })}
      </FormSection>

      <FormSection title="연락처">
        <FormRow>
          {text('phone', '대표 전화', { placeholder: '031-123-4567', inputMode: 'tel' })}
          {text('fax', '팩스', { inputMode: 'tel' })}
        </FormRow>
        <FormRow>
          {text('managerName', '센터장')}
          {text('managerPhone', '센터장 연락처', { inputMode: 'tel' })}
        </FormRow>
      </FormSection>

      <FormSection title="주소">
        <AddressFields
          idPrefix="center-address"
          value={{
            zipCode: form.zipCode,
            address: form.address,
            addressDetail: form.addressDetail,
          }}
          onChange={(address) => set(address)}
          disabled={disabled}
          errors={{
            zipCode: errors.zipCode,
            address: errors.address,
            addressDetail: errors.addressDetail,
          }}
        />
      </FormSection>

      <FormSection
        title="외부 코드"
        description="SAP·ERP 등과 연동할 때 그쪽의 센터 코드를 적습니다."
      >
        <ExternalCodesFields
          idPrefix="center"
          value={{ ...EMPTY_EXTERNAL_CODES, ...form.externalCodes }}
          onChange={(externalCodes) => set({ externalCodes })}
          disabled={disabled}
          errors={{ SAP: errors['externalCodes.SAP'], ERP: errors['externalCodes.ERP'] }}
        />
      </FormSection>

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button asChild type="button" variant="outline">
          <Link href={LIST_HREF}>{readOnly ? '목록으로' : '취소'}</Link>
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={pending}>
            <SaveIcon />
            {pending ? '저장 중…' : '저장'}
          </Button>
        )}
      </div>
    </>
  )

  const right = center && (
    <>
      <FormSection title="상태">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {center.isActive ? (
            <StatusBadge tone="success">사용</StatusBadge>
          ) : (
            <StatusBadge tone="danger">사용 중지</StatusBadge>
          )}
          {canToggleActive && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant={center.isActive ? 'destructive' : 'outline'}>
                  <PowerIcon />
                  {center.isActive ? '사용 중지' : '다시 사용'}
                </Button>
              }
              title={center.isActive ? '이 센터를 사용 중지할까요?' : '이 센터를 다시 사용할까요?'}
              description={
                center.isActive
                  ? '소속 직원은 이 센터의 데이터를 볼 수 없게 됩니다. 기록은 남습니다.'
                  : '소속 직원이 다시 이 센터의 데이터를 볼 수 있게 됩니다.'
              }
              confirmLabel={center.isActive ? '사용 중지' : '다시 사용'}
              destructive={center.isActive}
              onConfirm={async () => {
                unwrap(await setCenterActiveAction({ id: center.id, isActive: !center.isActive }))
                router.refresh()
              }}
            />
          )}
        </div>
      </FormSection>
      <WarehouseSummary
        centerId={center.id}
        warehouses={center.warehouses}
        canView={warehouseAccess.canView}
        canAdd={warehouseAccess.canAdd && center.isActive}
      />
    </>
  )

  return (
    <form onSubmit={submit}>
      <FormColumns left={left} right={right || undefined} />
    </form>
  )
}
