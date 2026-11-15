'use client'

import { useRouter } from 'next/navigation'
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
  OPERATOR_ADMIN_PREFIX,
  operatorRegisterSchema,
  type OperatorRegisterInput,
} from '@/lib/operator/operator-schema'
import { createOperatorAction } from '../actions'

const EMPTY: OperatorRegisterInput = { name: '', businessNumber: '', ceoName: '', adminSuffix: '' }

// 운영사 등록 폼 (0039 3c): 기본 정보 + 관리자 아이디 뒷자리
// 정의서의 나머지 칸(운영사 코드·유형 등)은 M2.5 4단계에서 더한다
export function OperatorRegisterForm({ header }: { header: MasterFormHeader }) {
  const router = useRouter()
  const form = useMasterForm({
    initial: EMPTY,
    schema: operatorRegisterSchema,
    save: (value: OperatorRegisterInput) => createOperatorAction(value),
    // 등록 화면이라 저장 후 값은 쓰지 않는다 (바로 목록으로)
    afterSave: () => EMPTY,
    onSuccess: () => router.push('/platform/operators'),
  })
  const { value, set, errors } = form
  const disabled = form.pending
  const id = (key: string) => `operator-${key}`
  const props = (key: keyof OperatorRegisterInput) => ({
    id: id(key),
    disabled,
    'aria-invalid': Boolean(errors[key]),
  })
  // 관리자 아이디 미리보기 (서버도 같은 규칙: 소문자로)
  const adminUsername = `${OPERATOR_ADMIN_PREFIX}${value.adminSuffix.trim().toLowerCase() || '○○'}`

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
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
        '이 운영사의 첫 관리자입니다. 처음 비밀번호는 모든 운영사가 같은 값(서버 설정)이니, 처음 로그인한 뒤 바꾸도록 안내하세요.',
      content: (
        <FormGrid>
          <Field
            label="관리자 아이디 뒷자리"
            span={4}
            required
            error={errors.adminSuffix}
            htmlFor={id('adminSuffix')}
            hint={`관리자 아이디: ${adminUsername}`}
          >
            <Input
              {...props('adminSuffix')}
              value={value.adminSuffix}
              placeholder="예: nara"
              onChange={(e) => set({ adminSuffix: e.target.value })}
            />
          </Field>
        </FormGrid>
      ),
    },
  ]

  return <MasterFormPage header={header} form={form} readOnly={false} sections={sections} />
}
