'use client'

import { BizNoInput } from '@/components/inputs'
import {
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormHeader,
  type MasterFormSection,
} from '@/components/master-form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OPERATOR_TYPE } from '@/config/operator-codes'
import {
  adminUsernameOf,
  operatorRegisterSchema,
  type OperatorRegisterInput,
} from '@/lib/operator/operator-schema'
import { createOperatorAction } from '../actions'

const EMPTY: OperatorRegisterInput = {
  code: '',
  name: '',
  businessNumber: '',
  ceoName: '',
  type: '3PL',
}

// 운영사 등록 폼 (0039 3c, 0040): 운영사코드·회사명·유형·사업자등록번호·대표자
// 나머지 칸은 기본값으로 들어가고, 등록 후 편집 화면에서 채운다. 관리자는 admin.{운영사코드 소문자}
export function OperatorRegisterForm({ header }: { header: MasterFormHeader }) {
  const form = useMasterForm({
    initial: EMPTY,
    schema: operatorRegisterSchema,
    save: (value: OperatorRegisterInput) => createOperatorAction(value),
    // 등록하면 [계속 등록]·[등록한 항목 보기](편집 화면에서 나머지 칸을 이어서 채운다)
    createdHref: (created) => `/platform/operators/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = form.pending
  const id = (key: string) => `operator-${key}`
  const props = (key: keyof OperatorRegisterInput) => ({
    id: id(key),
    disabled,
    'aria-invalid': Boolean(errors[key]),
  })
  // 관리자 아이디 미리보기 (서버도 같은 규칙)
  const adminUsername = adminUsernameOf(value.code.trim() || '○○')

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field
            label="운영사코드"
            span={4}
            required
            error={errors.code}
            htmlFor={id('code')}
            hint="영문·숫자 2~20자, 등록 후 바꿀 수 없습니다"
          >
            <Input
              {...props('code')}
              value={value.code}
              placeholder="예: NARA"
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="회사명" span={8} required error={errors.name} htmlFor={id('name')}>
            <Input
              {...props('name')}
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <Field
            label="사업자등록번호"
            span={4}
            required
            newRow
            error={errors.businessNumber}
            htmlFor={id('businessNumber')}
          >
            <BizNoInput
              {...props('businessNumber')}
              value={value.businessNumber}
              onChange={(businessNumber) => set({ businessNumber })}
            />
          </Field>
          <Field label="운영사 유형" span={4} required error={errors.type} htmlFor={id('type')}>
            <Select value={value.type} onValueChange={(type) => set({ type })} disabled={disabled}>
              <SelectTrigger id={id('type')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_TYPE.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="대표자" span={4} error={errors.ceoName} htmlFor={id('ceoName')}>
            <Input
              {...props('ceoName')}
              value={value.ceoName ?? ''}
              onChange={(e) => set({ ceoName: e.target.value })}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'admin',
      title: '관리자 계정',
      description:
        '이 운영사의 첫 관리자입니다. 아이디는 운영사코드로 정해지고, 처음 비밀번호는 모든 운영사가 같은 값(서버 설정)이니 처음 로그인한 뒤 바꾸도록 안내하세요.',
      content: (
        <FormGrid>
          <Field label="관리자 아이디" span={4} htmlFor={id('adminUsername')}>
            <Input id={id('adminUsername')} value={adminUsername} disabled readOnly />
          </Field>
        </FormGrid>
      ),
    },
  ]

  return <MasterFormPage header={header} form={form} readOnly={false} sections={sections} />
}
