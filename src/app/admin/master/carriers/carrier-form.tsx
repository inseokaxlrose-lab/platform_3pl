'use client'

import { NumberInput, PhoneInput } from '@/components/inputs'
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
import { Textarea } from '@/components/ui/textarea'
import {
  CARRIER_STATUS,
  CARRIER_TYPE,
  INVOICE_CHECK_RULE,
  type InvoiceCheckRule,
} from '@/lib/carriers/carrier-codes'
import { carrierCreateSchema, type CarrierCreateInput } from '@/lib/carriers/carrier-schema'
import { bodyDigitsOf, invoiceNoOf } from '@/lib/carriers/invoice-no'
import { createCarrierAction, updateCarrierAction } from './actions'
import type { CarrierForEdit } from './queries'

export const CARRIER_LIST_HREF = '/admin/master/carriers'

const EMPTY: CarrierCreateInput = {
  code: '',
  custCode: '',
  name: '',
  carrierType: 'PARCEL',
  invoiceDigits: '',
  invoiceCheck: 'NONE',
  trackingUrl: '',
  tel: '',
  status: 'ACTIVE',
  sortOrder: 100,
  remark: '',
}

// 송장 규칙 예시: 본번호 1, 2, 3 … 으로 채운 번호에 체크디지트를 붙여 보여 준다
function invoiceExample(digits: string, rule: InvoiceCheckRule) {
  const total = Number(digits)
  if (!/^\d{1,2}$/.test(digits) || total < 4 || total > 20) return null
  const bodyLength = bodyDigitsOf(total, rule) ?? total
  const body = Array.from({ length: bodyLength }, (_, i) => String((i + 1) % 10)).join('')
  return invoiceNoOf(body, rule)
}

// 운송사 등록·수정 (0094): 코드·이름·운송 유형 + 송장 규칙(자릿수·체크디지트·조회 주소)
export function CarrierForm({
  header,
  carrier,
  readOnly,
}: {
  header: MasterFormHeader
  carrier?: CarrierForEdit
  readOnly: boolean
}) {
  const form = useMasterForm({
    initial: carrier?.input ?? EMPTY,
    version: carrier?.rowVersion,
    schema: carrierCreateSchema,
    save: (value: CarrierCreateInput, version) => {
      if (!carrier) return createCarrierAction(value)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { code, ...rest } = value
      return updateCarrierAction({
        ...rest,
        id: carrier.id,
        rowVersion: version ?? carrier.rowVersion,
      })
    },
    createdHref: carrier
      ? undefined
      : (created) => `${CARRIER_LIST_HREF}/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `carrier-${key}`
  const example = invoiceExample(value.invoiceDigits, value.invoiceCheck as InvoiceCheckRule)

  // 고르기 칸 (값 목록 상수)
  const choose = <K extends 'carrierType' | 'invoiceCheck' | 'status'>(
    key: K,
    label: string,
    options: readonly { value: string; label: string }[],
    span: 3 | 4 = 3,
  ) => (
    <Field label={label} span={span} required error={errors[key]} htmlFor={id(key)}>
      <Select
        value={value[key]}
        onValueChange={(next) => set({ [key]: next } as Partial<CarrierCreateInput>)}
        disabled={disabled}
      >
        <SelectTrigger id={id(key)} className="w-full">
          <SelectValue />
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

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field
            label="운송사 코드"
            span={3}
            required
            error={errors.code}
            htmlFor={id('code')}
            hint={carrier ? '바꿀 수 없습니다' : '예: CJ, HANJIN'}
          >
            <Input
              id={id('code')}
              value={value.code}
              onChange={(e) => set({ code: e.target.value })}
              disabled={disabled || Boolean(carrier)}
              readOnly={Boolean(carrier)}
              maxLength={20}
              aria-invalid={Boolean(errors.code)}
            />
          </Field>
          <Field label="운송사명" span={6} required error={errors.name} htmlFor={id('name')}>
            <Input
              id={id('name')}
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              disabled={disabled}
              maxLength={50}
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          {choose('status', '상태', CARRIER_STATUS.options)}
          {choose('carrierType', '운송 유형', CARRIER_TYPE.options)}
          <Field
            label="사용자 정의 코드"
            span={3}
            error={errors.custCode}
            htmlFor={id('custCode')}
            hint="화주·ERP 시스템의 택배사 코드"
          >
            <Input
              id={id('custCode')}
              value={value.custCode}
              onChange={(e) => set({ custCode: e.target.value })}
              disabled={disabled}
              maxLength={50}
              aria-invalid={Boolean(errors.custCode)}
            />
          </Field>
          <Field label="대표 전화" span={3} error={errors.tel} htmlFor={id('tel')}>
            <PhoneInput
              id={id('tel')}
              value={value.tel}
              onChange={(tel) => set({ tel })}
              disabled={disabled}
              aria-invalid={Boolean(errors.tel)}
            />
          </Field>
          <Field label="정렬순서" span={3} error={errors.sortOrder} htmlFor={id('sortOrder')}>
            <NumberInput
              id={id('sortOrder')}
              value={value.sortOrder}
              onChange={(n) => set({ sortOrder: n ?? 0 })}
              min={0}
              max={9999}
              disabled={disabled}
            />
          </Field>
          <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
            <Textarea
              id={id('remark')}
              rows={2}
              value={value.remark}
              onChange={(e) => set({ remark: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'invoice',
      title: '송장 규칙',
      description:
        '송장번호 자릿수·체크디지트로 운송 계약의 송장 대역과 출고 송장번호를 검사합니다. 계약서의 규칙과 다르면 고쳐 주세요.',
      content: (
        <FormGrid>
          <Field
            label="송장 자릿수"
            span={3}
            error={errors.invoiceDigits}
            htmlFor={id('invoiceDigits')}
            hint="체크디지트 포함, 비우면 검사 안 함"
          >
            <Input
              id={id('invoiceDigits')}
              inputMode="numeric"
              value={value.invoiceDigits}
              onChange={(e) => set({ invoiceDigits: e.target.value })}
              disabled={disabled}
              maxLength={2}
              aria-invalid={Boolean(errors.invoiceDigits)}
            />
          </Field>
          {choose('invoiceCheck', '체크디지트', INVOICE_CHECK_RULE.options)}
          <Field label="번호 예시" span={6}>
            <p className="flex h-9 items-center font-mono text-sm text-muted-foreground">
              {example ?? '자릿수를 넣으면 예시가 보입니다'}
              {example && value.invoiceCheck !== 'NONE' && (
                <span className="ml-2 font-sans text-xs">(끝자리가 체크디지트)</span>
              )}
            </p>
          </Field>
          <Field
            label="배송 조회 주소"
            span={12}
            error={errors.trackingUrl}
            htmlFor={id('trackingUrl')}
            hint="송장번호가 들어갈 자리에 {invoiceNo}를 넣습니다"
          >
            <Input
              id={id('trackingUrl')}
              value={value.trackingUrl}
              onChange={(e) => set({ trackingUrl: e.target.value })}
              disabled={disabled}
              maxLength={300}
              placeholder="https://…?invoiceNo={invoiceNo}"
              aria-invalid={Boolean(errors.trackingUrl)}
            />
          </Field>
        </FormGrid>
      ),
    },
  ]

  return <MasterFormPage header={header} form={form} readOnly={readOnly} sections={sections} />
}
