'use client'

import { CenterSelect, DateInput, SearchSelect, YnToggle } from '@/components/inputs'
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
import { CARRIER_STATUS, type InvoiceCheckRule } from '@/lib/carriers/carrier-codes'
import { contractSchema, type ContractInput } from '@/lib/carriers/contract-schema'
import { bodyDigitsOf, invoiceNoOf, remainingInvoices } from '@/lib/carriers/invoice-no'
import { createContractAction, updateContractAction } from './actions'
import type { ContractForEdit, ContractOptions } from './queries'

export const CONTRACT_LIST_HREF = '/admin/master/carrier-contracts'

// 화주 고르기의 "센터 공용" 값 (입력 규칙에서는 빈 글자 = 공용)
const COMMON = ''

const EMPTY: ContractInput = {
  carrierId: '',
  centerId: '',
  shipperId: COMMON,
  custNo: '',
  pickupBranch: '',
  invoiceStart: '',
  invoiceEnd: '',
  invoiceNext: '',
  isDefault: false,
  validFrom: '',
  validTo: '',
  status: 'ACTIVE',
  remark: '',
}

const digitsOnly = (value: string) => value.replace(/[\s-]/g, '')

// 운송 계약 등록·수정 (0094): 센터(·화주)별 택배사 고객코드·집하 점소·송장 대역
export function ContractForm({
  header,
  contract,
  options,
  readOnly,
}: {
  header: MasterFormHeader
  contract?: Omit<ContractForEdit, 'carrierId'>
  options: ContractOptions
  readOnly: boolean
}) {
  const form = useMasterForm({
    initial: contract?.input ?? EMPTY,
    version: contract?.rowVersion,
    schema: contractSchema,
    save: (value: ContractInput, version) =>
      contract
        ? updateContractAction({
            ...value,
            id: contract.id,
            rowVersion: version ?? contract.rowVersion,
          })
        : createContractAction(value),
    createdHref: contract
      ? undefined
      : (created) => `${CONTRACT_LIST_HREF}/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `contract-${key}`

  const center = options.centers.find((c) => c.id === value.centerId)
  const carrier = options.carriers.find((c) => c.id === value.carrierId)
  const parcel = carrier?.carrierType === 'PARCEL'
  const rule = (carrier?.invoiceCheck ?? 'NONE') as InvoiceCheckRule
  const bodyDigits = carrier ? bodyDigitsOf(carrier.invoiceDigits, rule) : null

  // 송장 대역 안내: 첫 송장번호(체크디지트 포함)·남은 수
  const start = digitsOnly(value.invoiceStart)
  const end = digitsOnly(value.invoiceEnd)
  const next = digitsOnly(value.invoiceNext) || start
  const rangeReady = /^\d+$/.test(start) && /^\d+$/.test(end) && /^\d+$/.test(next)
  const rangeHint = rangeReady
    ? `다음 송장번호 ${invoiceNoOf(next, rule)} · 남은 ${BigInt(
        remainingInvoices({ next, end }),
      ).toLocaleString('ko-KR')}장`
    : bodyDigits !== null
      ? `본번호 ${bodyDigits}자리${rule === 'NONE' ? '' : ' (송장번호 끝자리 체크디지트는 빼고)'}`
      : undefined

  const body = (
    key: 'invoiceStart' | 'invoiceEnd' | 'invoiceNext',
    label: string,
    hint?: string,
  ) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)} hint={hint}>
      <Input
        id={id(key)}
        inputMode="numeric"
        value={value[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        disabled={disabled || !parcel}
        maxLength={24}
        className="font-mono"
        aria-invalid={Boolean(errors[key])}
      />
    </Field>
  )

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '계약',
      description:
        '화주를 비우면 센터 공용 계약입니다. 출고 때는 화주×센터 계약 → 센터 공용 계약 → 화주사 기본 택배사 순서로 찾습니다.',
      content: (
        <FormGrid>
          <Field label="센터" span={4} required error={errors.centerId} htmlFor={id('centerId')}>
            <CenterSelect
              id={id('centerId')}
              options={options.centers}
              value={value.centerId}
              // 센터가 바뀌면 그 센터를 이용하지 않는 화주는 비운다
              onChange={(centerId) => set({ centerId, shipperId: COMMON })}
              disabled={disabled}
              invalid={Boolean(errors.centerId)}
            />
          </Field>
          <Field
            label="화주사"
            span={4}
            error={errors.shipperId}
            htmlFor={id('shipperId')}
            hint="센터를 이용하는 화주사만"
          >
            <SearchSelect
              id={id('shipperId')}
              options={[
                { value: COMMON, label: '센터 공용 (모든 화주)' },
                ...(center?.shippers ?? []).map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.code})`,
                })),
              ]}
              value={value.shipperId ?? COMMON}
              onChange={(shipperId) => set({ shipperId })}
              disabled={disabled || !center}
              invalid={Boolean(errors.shipperId)}
            />
          </Field>
          <Field
            label="운송사"
            span={4}
            required
            error={errors.carrierId}
            htmlFor={id('carrierId')}
          >
            <SearchSelect
              id={id('carrierId')}
              options={options.carriers.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.code})${c.status === 'ACTIVE' ? '' : ' · 사용 중지'}`,
              }))}
              value={value.carrierId}
              onChange={(carrierId) => set({ carrierId })}
              placeholder="운송사 선택"
              disabled={disabled}
              invalid={Boolean(errors.carrierId)}
            />
          </Field>
          <Field
            label="고객코드"
            span={4}
            required
            error={errors.custNo}
            htmlFor={id('custNo')}
            hint="택배사가 준 계약(고객)번호"
          >
            <Input
              id={id('custNo')}
              value={value.custNo}
              onChange={(e) => set({ custNo: e.target.value })}
              disabled={disabled}
              maxLength={30}
              aria-invalid={Boolean(errors.custNo)}
            />
          </Field>
          <Field
            label="집하 점소"
            span={4}
            error={errors.pickupBranch}
            htmlFor={id('pickupBranch')}
          >
            <Input
              id={id('pickupBranch')}
              value={value.pickupBranch}
              onChange={(e) => set({ pickupBranch: e.target.value })}
              disabled={disabled}
              maxLength={50}
            />
          </Field>
          <Field
            label="기본 계약"
            span={4}
            htmlFor={id('isDefault')}
            hint="같은 센터·화주에서 먼저 쓰는 계약 (하나만)"
          >
            <YnToggle
              id={id('isDefault')}
              value={value.isDefault}
              onChange={(isDefault) => set({ isDefault })}
              onLabel="기본"
              offLabel="아님"
              disabled={disabled}
            />
          </Field>
          <Field label="시작일" span={4} error={errors.validFrom} htmlFor={id('validFrom')}>
            <DateInput
              id={id('validFrom')}
              value={value.validFrom}
              onChange={(validFrom) => set({ validFrom })}
              disabled={disabled}
            />
          </Field>
          <Field
            label="종료일"
            span={4}
            error={errors.validTo}
            htmlFor={id('validTo')}
            hint="비우면 기한 없음"
          >
            <DateInput
              id={id('validTo')}
              value={value.validTo}
              onChange={(validTo) => set({ validTo })}
              disabled={disabled}
              min={value.validFrom || undefined}
            />
          </Field>
          <Field label="상태" span={4} htmlFor={id('status')}>
            <Select
              value={value.status}
              onValueChange={(status) => set({ status: status as ContractInput['status'] })}
              disabled={disabled}
            >
              <SelectTrigger id={id('status')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARRIER_STATUS.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      title: '송장 대역',
      description: parcel
        ? '택배사가 미리 나눠 준 송장번호 묶음입니다. 체크디지트를 뺀 본번호로 적고, 같은 택배사의 다른 계약과 겹칠 수 없습니다. 택배사 연동으로 번호를 받으면 비워 둡니다.'
        : '송장 대역은 택배 운송사만 씁니다.',
      content: (
        <FormGrid>
          {body('invoiceStart', '시작 번호')}
          {body('invoiceEnd', '끝 번호')}
          {body('invoiceNext', '다음 번호', '비우면 시작 번호부터')}
          {rangeHint && parcel && (
            <p className="col-span-12 text-sm text-muted-foreground" data-testid="invoice-hint">
              {rangeHint}
            </p>
          )}
        </FormGrid>
      ),
    },
  ]

  return <MasterFormPage header={header} form={form} readOnly={readOnly} sections={sections} />
}
