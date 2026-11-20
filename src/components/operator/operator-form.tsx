'use client'

import {
  AddressInput,
  BizNoInput,
  CorpRegNoInput,
  DateInput,
  EmailInput,
  PhoneInput,
} from '@/components/inputs'
import {
  contactExtraColumns,
  EditableSubTable,
  Field,
  type FieldSpan,
  FormGrid,
  type MasterFormHeader,
  MasterFormPage,
  useMasterForm,
} from '@/components/master-form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { BIZ_ENTITY, OPERATOR_TYPE, TAX_TYPE } from '@/config/operator-codes'
import type { ActionResult } from '@/lib/actions/result'
import { toOperatorInput } from '@/lib/operator/operator-input'
import {
  CONTACT_ROLE_GROUP,
  EMPTY_CONTACT,
  MAX_OPERATOR_CONTACTS,
  operatorSchema,
  type OperatorData,
  type OperatorInput,
} from '@/lib/operator/operator-schema'

type TextKey =
  'name' | 'nameEn' | 'shortName' | 'subBizNo' | 'ceoName' | 'businessType' | 'businessItem'

type SelectKey = 'type' | 'bizEntity' | 'taxType'

type SaveResult = Promise<ActionResult<unknown>>
// 저장 서버 액션: 플랫폼 편집은 대상 운영사 키를 함께, 운영사 자기 화면은 키 없이
type SaveProps =
  | {
      operatorId: string
      saveAction: (input: OperatorInput & { id: string; rowVersion: number }) => SaveResult
    }
  | {
      operatorId?: undefined
      saveAction: (input: OperatorInput & { rowVersion: number }) => SaveResult
    }

// 운영사 정보 폼 [1차 칸] (docs/specs/operator.md, 0040, 입력 화면 틀 0031)
// 플랫폼 편집(/platform/operators/[id])과 운영사 자기 화면(/admin/master/operator)이 같이 쓴다
// - 운영사코드는 항상 읽기 전용, 운영사 유형은 플랫폼만 (canEditType)
// - 상태는 헤더 배지 + 플랫폼의 상태 변경 팝업으로 따로 (이 폼은 저장하지 않는다)
// - [2차] 칸은 DB·API에만 있고 섹션을 아직 만들지 않았다 (sections에 더하면 바로 열 수 있다)
export function OperatorForm({
  header,
  code,
  initial,
  version,
  readOnly,
  canEditType,
  ...saveProps
}: SaveProps & {
  header: MasterFormHeader
  // 운영사코드 (등록 후 바꿀 수 없다)
  code: string
  initial: OperatorInput
  // 불러올 때의 버전 (동시 수정 막기)
  version: number
  readOnly: boolean
  canEditType: boolean
}) {
  const form = useMasterForm({
    initial,
    version,
    schema: operatorSchema,
    // 수정 전용이라 버전은 항상 있다 (혹시 없으면 0 → 서버가 충돌로 막는다)
    save: (value, rowVersion) =>
      saveProps.operatorId === undefined
        ? saveProps.saveAction({ ...value, rowVersion: rowVersion ?? 0 })
        : saveProps.saveAction({ ...value, id: saveProps.operatorId, rowVersion: rowVersion ?? 0 }),
    afterSave: (data: OperatorData) => toOperatorInput(data),
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `operator-${key}`
  // 공통 속성: 칸 id, 오류 표시, 잠금
  const props = (key: string) => ({
    id: id(key),
    disabled,
    'aria-invalid': Boolean(errors[key]),
  })

  const text = (
    key: TextKey,
    label: string,
    span: FieldSpan,
    options: { required?: boolean; recommended?: boolean; newRow?: boolean } = {},
  ) => (
    <Field
      label={label}
      span={span}
      required={options.required}
      newRow={options.newRow}
      // ○ 권장: 검사하지 않고 안내만 (정의서 표기)
      hint={options.recommended && !value[key] ? '권장 — 채워 두면 출력물에 쓰입니다' : undefined}
      error={errors[key]}
      htmlFor={id(key)}
    >
      <Input {...props(key)} value={value[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  )

  // 플랫폼이 정하는 상수 코드 고르기 (공통코드가 아니라 src/config/operator-codes.ts)
  const select = (
    key: SelectKey,
    label: string,
    options: readonly { value: string; label: string }[],
    locked = false,
  ) => (
    <Field label={label} span={4} required error={errors[key]} htmlFor={id(key)}>
      <Select
        value={value[key]}
        onValueChange={(next) => set({ [key]: next })}
        disabled={disabled || locked}
      >
        <SelectTrigger id={id(key)} className="w-full" aria-invalid={Boolean(errors[key])}>
          <SelectValue placeholder="선택" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
              <Field
                label="운영사코드"
                span={4}
                htmlFor={id('code')}
                hint="등록 후 바꿀 수 없습니다"
              >
                <Input id={id('code')} value={code} disabled readOnly />
              </Field>
              {text('name', '회사명', 8, { required: true })}
              {text('nameEn', '영문명', 6)}
              {text('shortName', '약칭', 2)}
              {select('type', '운영사 유형', OPERATOR_TYPE.options, !canEditType)}
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
              {select('bizEntity', '사업자 구분', BIZ_ENTITY.options)}
              {/* 법인등록번호는 법인일 때만 (개인이면 저장할 때 비운다) */}
              {value.bizEntity === 'CORP' && (
                <Field
                  label="법인등록번호"
                  span={4}
                  error={errors.corpRegNo}
                  htmlFor={id('corpRegNo')}
                >
                  <CorpRegNoInput
                    {...props('corpRegNo')}
                    value={value.corpRegNo}
                    onChange={(corpRegNo) => set({ corpRegNo })}
                  />
                </Field>
              )}
              {text('subBizNo', '종사업장번호', 2)}
              {select('taxType', '과세유형', TAX_TYPE.options)}
              {text('ceoName', '대표자', 4, { recommended: true, newRow: true })}
              {text('businessType', '업태', 4, { recommended: true })}
              {text('businessItem', '종목', 4, { recommended: true })}
              <Field
                label="설립일"
                span={3}
                error={errors.establishedOn}
                htmlFor={id('establishedOn')}
              >
                <DateInput
                  {...props('establishedOn')}
                  value={value.establishedOn}
                  onChange={(establishedOn) => set({ establishedOn })}
                />
              </Field>
              <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
                <Textarea
                  {...props('remark')}
                  rows={3}
                  value={value.remark}
                  onChange={(e) => set({ remark: e.target.value })}
                />
              </Field>
            </FormGrid>
          ),
        },
        {
          id: 'contact',
          title: '연락처·주소',
          content: (
            <FormGrid>
              <Field
                label="대표 전화"
                span={4}
                hint={value.phone ? undefined : '권장'}
                error={errors.phone}
                htmlFor={id('phone')}
              >
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
              <Field
                label="주소"
                span={12}
                hint={value.address ? undefined : '권장'}
                htmlFor={id('address-address')}
              >
                <AddressInput
                  idPrefix={id('address')}
                  value={{
                    zipCode: value.zipCode,
                    address: value.address,
                    addressDetail: value.addressDetail,
                  }}
                  onChange={(address) => set(address)}
                  // 지번주소는 검색 결과를 자동 저장 (화면에는 보이지 않는다)
                  onJibunAddress={(addressJibun) => set({ addressJibun })}
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
                  input: { codeGroup: CONTACT_ROLE_GROUP },
                },
                { key: 'name', label: '담당자명', required: true, width: '8rem' },
                { key: 'phone', label: '연락처', width: '10rem', input: 'phone' },
                { key: 'email', label: '이메일', input: 'email' },
                ...contactExtraColumns(),
              ]}
              createRow={() => ({ ...EMPTY_CONTACT })}
              maxRows={MAX_OPERATOR_CONTACTS}
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
