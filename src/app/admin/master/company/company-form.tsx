'use client'

import { PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AddressFields, FormColumns, FormField, FormSection } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  companySchema,
  EMPTY_CONTACT,
  MAX_COMPANY_CONTACTS,
  type CompanyContactInput,
  type CompanyData,
  type CompanyInput,
} from '@/lib/company/company-schema'
import { saveCompanyAction } from './actions'

type CompanyFormProps = {
  initial: CompanyInput
  // 수정 권한이 없으면 읽기 전용
  readOnly: boolean
}

// 저장할 값(빈 칸 null) → 입력값(빈 글자)
function toFormValues(data: CompanyData): CompanyInput {
  const text = (value: string | null) => value ?? ''
  return {
    name: data.name,
    businessNumber: data.businessNumber,
    ceoName: text(data.ceoName),
    businessType: text(data.businessType),
    businessItem: text(data.businessItem),
    phone: text(data.phone),
    fax: text(data.fax),
    email: text(data.email),
    zipCode: text(data.zipCode),
    address: text(data.address),
    addressDetail: text(data.addressDetail),
    contacts: data.contacts.map((c) => ({ ...c, phone: text(c.phone), email: text(c.email) })),
  }
}

// 오류 위치 → 문구 (예: 'businessNumber', 'contacts.0.name')
type Errors = Record<string, string>

// 운영사 정보 입력 폼 (docs/decisions/0024)
// 저장 전에 화면에서 같은 규칙(companySchema)으로 먼저 검사해 담당자 줄별 오류까지 보여주고,
// 서버도 같은 규칙으로 다시 검사한다
export function CompanyForm({ initial, readOnly }: CompanyFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<CompanyInput>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const set = (patch: Partial<CompanyInput>) => setForm((previous) => ({ ...previous, ...patch }))
  const setContact = (index: number, patch: Partial<CompanyContactInput>) =>
    set({ contacts: form.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)) })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setMessage(null)
    const parsed = companySchema.safeParse(form)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      )
      setMessage({ ok: false, text: '입력값을 확인해 주세요.' })
      return
    }
    setErrors({})
    startTransition(async () => {
      const result = await saveCompanyAction(form)
      if (!result.ok) {
        setErrors(
          Object.fromEntries(
            Object.entries(result.error.fieldErrors ?? {}).map(([key, list]) => [key, list[0]]),
          ),
        )
        setMessage({ ok: false, text: result.error.message })
        return
      }
      // 저장된 모양(사업자번호 하이픈, 이메일 소문자, 공백 제거)으로 입력값을 맞추고 '마지막 수정'을 새로 읽는다
      setForm(toFormValues(parsed.data))
      router.refresh()
      setMessage({ ok: true, text: '저장했습니다.' })
    })
  }

  const disabled = readOnly || pending
  // 입력 칸 하나 (이름표·오류 포함)
  const text = (
    key: Exclude<keyof CompanyInput, 'contacts'>,
    label: string,
    options: {
      required?: boolean
      placeholder?: string
      inputMode?: 'tel' | 'email' | 'numeric'
    } = {},
  ) => (
    <FormField
      label={label}
      required={options.required}
      error={errors[key]}
      htmlFor={`company-${key}`}
    >
      <Input
        id={`company-${key}`}
        value={form[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        disabled={disabled}
        placeholder={options.placeholder}
        inputMode={options.inputMode}
        aria-invalid={Boolean(errors[key])}
      />
    </FormField>
  )

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* 정보가 많아 좌우 2단: 왼쪽 기본 정보·연락처 → 오른쪽 주소·담당자 */}
      <FormColumns
        left={
          <>
            <FormSection title="기본 정보">
              {text('name', '회사명', { required: true })}
              {text('businessNumber', '사업자등록번호', {
                required: true,
                placeholder: '000-00-00000',
                inputMode: 'numeric',
              })}
              {text('ceoName', '대표자')}
              {text('businessType', '업태')}
              {text('businessItem', '종목')}
            </FormSection>

            <FormSection title="연락처">
              {text('phone', '대표 전화', { placeholder: '02-123-4567', inputMode: 'tel' })}
              {text('fax', '팩스', { placeholder: '02-123-4568', inputMode: 'tel' })}
              {text('email', '대표 이메일', { inputMode: 'email' })}
            </FormSection>
          </>
        }
        right={
          <>
            <FormSection title="주소">
              <AddressFields
                idPrefix="company-address"
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
              title={`담당자 (${form.contacts.length}/${MAX_COMPANY_CONTACTS})`}
              action={
                !readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || form.contacts.length >= MAX_COMPANY_CONTACTS}
                    onClick={() => set({ contacts: [...form.contacts, { ...EMPTY_CONTACT }] })}
                  >
                    <PlusIcon />
                    담당자 추가
                  </Button>
                )
              }
            >
              {form.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">등록된 담당자가 없습니다.</p>
              ) : (
                <ul className="space-y-3">
                  {form.contacts.map((contact, index) => {
                    const field = (key: keyof CompanyContactInput) => `contacts.${index}.${key}`
                    const contactInput = (
                      key: keyof CompanyContactInput,
                      label: string,
                      required = false,
                      inputMode?: 'tel' | 'email',
                    ) => (
                      <FormField
                        label={label}
                        required={required}
                        error={errors[field(key)]}
                        htmlFor={`company-${field(key)}`}
                      >
                        <Input
                          id={`company-${field(key)}`}
                          value={contact[key]}
                          onChange={(e) => setContact(index, { [key]: e.target.value })}
                          disabled={disabled}
                          inputMode={inputMode}
                          aria-invalid={Boolean(errors[field(key)])}
                        />
                      </FormField>
                    )
                    return (
                      <li
                        key={index}
                        aria-label={`담당자 ${index + 1}`}
                        className="space-y-3 rounded-md border p-3"
                      >
                        {/* 카드 머리: 순번 + 삭제 */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">
                            담당자 {index + 1}
                          </span>
                          {!readOnly && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`담당자 ${index + 1} 삭제`}
                              disabled={pending}
                              onClick={() => {
                                set({ contacts: form.contacts.filter((_, i) => i !== index) })
                                setErrors({})
                              }}
                            >
                              <Trash2Icon />
                            </Button>
                          )}
                        </div>
                        {/* 반쪽 너비 안이라 두 칸씩: 업무·이름 / 연락처·이메일 */}
                        <div className="grid items-start gap-3 sm:grid-cols-2">
                          {contactInput('duty', '담당 업무', true)}
                          {contactInput('name', '담당자명', true)}
                          {contactInput('phone', '연락처', false, 'tel')}
                          {contactInput('email', '이메일', false, 'email')}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {errors.contacts && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.contacts}
                </p>
              )}
            </FormSection>
          </>
        }
      />

      <div className="flex items-center justify-end gap-3">
        {message && (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={message.ok ? 'text-sm text-success' : 'text-sm text-destructive'}
          >
            {message.text}
          </p>
        )}
        {!readOnly && (
          <Button type="submit" disabled={pending}>
            <SaveIcon />
            {pending ? '저장 중…' : '저장'}
          </Button>
        )}
      </div>
    </form>
  )
}
