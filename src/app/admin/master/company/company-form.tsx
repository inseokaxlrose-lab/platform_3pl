'use client'

import { AddressInput, BizNoInput, EmailInput, PhoneInput } from '@/components/inputs'
import {
  EditableSubTable,
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type FieldSpan,
  type MasterFormHeader,
} from '@/components/master-form'
import { Input } from '@/components/ui/input'
import {
  companySchema,
  CONTACT_DUTY_GROUP,
  EMPTY_CONTACT,
  MAX_COMPANY_CONTACTS,
  type CompanyData,
  type CompanyInput,
} from '@/lib/company/company-schema'
import { saveCompanyAction } from './actions'

// 저장한 값(빈 칸 null) → 입력값(빈 글자). 번호는 숫자만 그대로 (입력 부품이 하이픈을 붙여 보여준다)
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

type TextKey = 'name' | 'ceoName' | 'businessType' | 'businessItem'

// 운영사 정보 (docs/decisions/0024, 0031): 공통 입력 화면 틀 + 운영사 칸 정의만 둔다
export function CompanyForm({
  header,
  initial,
  readOnly,
}: {
  // 페이지 헤더 (제목·설명·meta·보조 버튼)
  header: MasterFormHeader
  initial: CompanyInput
  // 수정 권한이 없으면 읽기 전용
  readOnly: boolean
}) {
  const form = useMasterForm({
    initial,
    schema: companySchema,
    save: saveCompanyAction,
    afterSave: toFormValues,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `company-${key}`
  // 공통 속성: 칸 id, 오류 표시, 잠금
  const props = (key: string) => ({
    id: id(key),
    disabled,
    'aria-invalid': Boolean(errors[key]),
  })

  const text = (key: TextKey, label: string, span: FieldSpan, required = false) => (
    <Field label={label} span={span} required={required} error={errors[key]} htmlFor={id(key)}>
      <Input {...props(key)} value={value[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  )

  return (
    <MasterFormPage
      header={header}
      form={form}
      readOnly={readOnly}
      sections={[
        {
          id: 'basic',
          title: '기본 정보',
          content: (
            <FormGrid>
              {text('name', '회사명', 8, true)}
              <Field
                label="사업자등록번호"
                span={4}
                required
                error={errors.businessNumber}
                htmlFor={id('businessNumber')}
              >
                <BizNoInput
                  {...props('businessNumber')}
                  value={value.businessNumber}
                  onChange={(businessNumber) => set({ businessNumber })}
                />
              </Field>
              {text('ceoName', '대표자', 4)}
              {text('businessType', '업태', 4)}
              {text('businessItem', '종목', 4)}
            </FormGrid>
          ),
        },
        {
          id: 'contact',
          title: '연락처·주소',
          content: (
            <FormGrid>
              <Field label="대표 전화" span={4} error={errors.phone} htmlFor={id('phone')}>
                <PhoneInput
                  {...props('phone')}
                  placeholder="02-123-4567"
                  value={value.phone}
                  onChange={(phone) => set({ phone })}
                />
              </Field>
              <Field label="팩스" span={4} error={errors.fax} htmlFor={id('fax')}>
                <PhoneInput
                  {...props('fax')}
                  placeholder="02-123-4568"
                  value={value.fax}
                  onChange={(fax) => set({ fax })}
                />
              </Field>
              <Field label="대표 이메일" span={8} error={errors.email} htmlFor={id('email')}>
                <EmailInput
                  {...props('email')}
                  value={value.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </Field>
              <Field label="주소" span={12} htmlFor={id('address-address')}>
                <AddressInput
                  idPrefix={id('address')}
                  value={{
                    zipCode: value.zipCode,
                    address: value.address,
                    addressDetail: value.addressDetail,
                  }}
                  onChange={(address) => set(address)}
                  disabled={disabled}
                  errors={{
                    zipCode: errors.zipCode,
                    address: errors.address,
                    addressDetail: errors.addressDetail,
                  }}
                />
              </Field>
            </FormGrid>
          ),
        },
        {
          id: 'contacts',
          title: '담당자',
          description: '연락처와 이메일 중 하나는 필수, 담당자가 있으면 대표 1명을 정합니다.',
          content: (
            <EditableSubTable
              name="contacts"
              rows={value.contacts}
              onChange={(contacts) => set({ contacts })}
              columns={[
                {
                  key: 'duty',
                  label: '담당 업무',
                  required: true,
                  width: '8.5rem',
                  input: { codeGroup: CONTACT_DUTY_GROUP },
                },
                { key: 'name', label: '담당자명', required: true, width: '8rem' },
                { key: 'phone', label: '연락처', width: '10rem', input: 'phone' },
                { key: 'email', label: '이메일', input: 'email' },
              ]}
              createRow={() => ({ ...EMPTY_CONTACT })}
              maxRows={MAX_COMPANY_CONTACTS}
              primary={{ key: 'isPrimary', label: '대표' }}
              errors={errors}
              addLabel="담당자 추가"
              countUnit="명"
              emptyText="등록된 담당자가 없습니다."
              disabled={disabled}
            />
          ),
        },
      ]}
    />
  )
}
