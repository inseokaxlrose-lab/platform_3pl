'use client'

import { PowerIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { AddressInput, BizNoInput, EmailInput, PhoneInput } from '@/components/inputs'
import {
  EditableSubTable,
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type FieldSpan,
  type MasterFormHeader,
  type MasterFormSection,
} from '@/components/master-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { unwrap } from '@/lib/actions'
import { toContactInput } from '@/lib/contacts/contact-schema'
import type { CustomerForEdit, CustomerShipperOption } from '@/lib/customers/customer-queries'
import {
  CONTACT_ROLE_GROUP,
  customerCreateSchema,
  EMPTY_CONTACT,
  MAX_CUSTOMER_CONTACTS,
  type CustomerCreateData,
  type CustomerCreateInput,
} from '@/lib/customers/customer-schema'
import { toYn } from '@/lib/yn'
import { createCustomerAction, setCustomersActiveAction, updateCustomerAction } from './actions'

const EMPTY: CustomerCreateInput = {
  shipperId: '',
  code: '',
  name: '',
  businessNumber: '',
  ceoName: '',
  phone: '',
  email: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  regionCode: '',
  receiverName: '',
  receiverPhone: '',
  deliveryMemo: '',
  deliveryCenterId: '',
  remark: '',
  contacts: [],
}

// 저장한 값(키 bigint, 빈 칸 null) → 입력값(글자)
function toFormValues(data: CustomerCreateData): CustomerCreateInput {
  const text = (value: string | null) => value ?? ''
  return {
    shipperId: String(data.shipperId),
    code: data.code,
    name: data.name,
    businessNumber: text(data.businessNumber),
    ceoName: text(data.ceoName),
    phone: text(data.phone),
    email: text(data.email),
    zipCode: text(data.zipCode),
    address: text(data.address),
    addressDetail: text(data.addressDetail),
    regionCode: text(data.regionCode),
    receiverName: text(data.receiverName),
    receiverPhone: text(data.receiverPhone),
    deliveryMemo: text(data.deliveryMemo),
    deliveryCenterId: data.deliveryCenterId ? String(data.deliveryCenterId) : '',
    remark: text(data.remark),
    contacts: data.contacts.map((c) => toContactInput({ ...c, isPrimary: toYn(c.isPrimary) })),
  }
}

type TextKey = 'code' | 'name' | 'ceoName' | 'receiverName'

// 배송 센터 '지정 안 함' (Select는 빈 값을 쓸 수 없어 따로 둔다)
const NO_CENTER = '__none__'

// 거래처 등록·수정 (docs/decisions/0043, 입력 화면 틀 0031)
// 배송지 주소를 검색하면 법정동코드가 자동으로 저장된다 (우편번호가 없을 때 권역설정과 맞춰 보는 데 쓴다, 화면 미노출)
export function CustomerForm({
  header,
  shippers,
  customer,
  readOnly,
  canToggleActive = false,
}: {
  header: MasterFormHeader
  // 등록할 때 고를 화주사 (범위 안의 사용 중인 화주사)
  shippers: CustomerShipperOption[]
  // 없으면 등록
  customer?: CustomerForEdit
  readOnly: boolean
  canToggleActive?: boolean
}) {
  const router = useRouter()
  const form = useMasterForm({
    initial: customer ? { ...customer.input, shipperId: customer.shipperId } : EMPTY,
    version: customer?.rowVersion,
    schema: customerCreateSchema,
    save: (value: CustomerCreateInput, version) =>
      customer
        ? updateCustomerAction({
            ...value,
            id: customer.id,
            rowVersion: version ?? customer.rowVersion,
          })
        : createCustomerAction(value),
    afterSave: toFormValues,
    onSuccess: customer
      ? undefined
      : (created) => router.push(`/admin/master/customers/${(created as { id: string }).id}`),
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  // 배송 센터로 고를 수 있는 센터: 수정은 그 거래처의 화주사, 등록은 고른 화주사의 이용 센터 (0072)
  const deliveryCenters =
    customer?.deliveryCenters ?? shippers.find((s) => s.id === value.shipperId)?.centers ?? []
  const id = (key: string) => `customer-${key}`
  const props = (key: string) => ({ id: id(key), disabled, 'aria-invalid': Boolean(errors[key]) })

  const text = (
    key: TextKey,
    label: string,
    span: FieldSpan,
    extra: { required?: boolean; placeholder?: string; newRow?: boolean } = {},
  ) => (
    <Field
      label={label}
      span={span}
      required={extra.required}
      newRow={extra.newRow}
      error={errors[key]}
      htmlFor={id(key)}
    >
      <Input
        {...props(key)}
        value={value[key]}
        placeholder={extra.placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </Field>
  )
  const phone = (key: 'phone' | 'receiverPhone', label: string) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)}>
      <PhoneInput
        {...props(key)}
        placeholder="010-1234-5678"
        value={value[key]}
        onChange={(digits) => set({ [key]: digits })}
      />
    </Field>
  )

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field
            label="화주사"
            span={6}
            required
            error={errors.shipperId}
            htmlFor={id('shipperId')}
          >
            {customer ? (
              // 화주사는 등록 후 바꿀 수 없다
              <Input id={id('shipperId')} value={customer.shipper} disabled readOnly />
            ) : (
              <Select
                value={value.shipperId}
                // 화주사를 바꾸면 배송 센터는 다시 고른다 (이용 센터가 다르다)
                onValueChange={(shipperId) => set({ shipperId, deliveryCenterId: '' })}
                disabled={disabled}
              >
                <SelectTrigger
                  id={id('shipperId')}
                  className="w-full"
                  aria-invalid={Boolean(errors.shipperId)}
                >
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {shippers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {text('code', '거래처코드', 3, { placeholder: '비우면 시스템 코드', newRow: true })}
          <Field
            label="시스템 코드"
            span={3}
            htmlFor={id('system-code')}
            hint="출고·이력에 쓰는 바뀌지 않는 코드"
          >
            <Input
              id={id('system-code')}
              value={customer?.systemCode ?? '저장하면 자동으로 부여됩니다'}
              disabled
              readOnly
            />
          </Field>
          {text('name', '거래처명', 8, { required: true, newRow: true })}
          <Field
            label="사업자등록번호"
            span={4}
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
          {text('ceoName', '대표자', 4)}
          {phone('phone', '대표 전화')}
          <Field label="이메일" span={8} error={errors.email} htmlFor={id('email')}>
            <EmailInput
              {...props('email')}
              value={value.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
            <Textarea
              {...props('remark')}
              rows={2}
              value={value.remark}
              onChange={(e) => set({ remark: e.target.value })}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'delivery',
      title: '배송지',
      description:
        '주소를 검색하면 우편번호와 지역 코드가 함께 저장되어 권역설정의 배송센터를 찾는 데 씁니다.',
      content: (
        <FormGrid>
          <Field label="주소" span={12} htmlFor={id('address-address')}>
            <AddressInput
              idPrefix={id('address')}
              value={{
                zipCode: value.zipCode,
                address: value.address,
                addressDetail: value.addressDetail,
              }}
              onChange={(address) => set(address)}
              onRegionCode={(regionCode) => set({ regionCode })}
              disabled={disabled}
              errors={{
                zipCode: errors.zipCode,
                address: errors.address,
                addressDetail: errors.addressDetail,
              }}
            />
          </Field>
          <Field
            label="배송 센터"
            span={4}
            error={errors.deliveryCenterId}
            htmlFor={id('deliveryCenterId')}
            hint="이 센터로 배송합니다. 비우면 권역설정(배송지 우편번호)으로 정합니다"
          >
            <Select
              value={value.deliveryCenterId || NO_CENTER}
              onValueChange={(v) => set({ deliveryCenterId: v === NO_CENTER ? '' : v })}
              disabled={disabled || deliveryCenters.length === 0}
            >
              <SelectTrigger
                id={id('deliveryCenterId')}
                className="w-full"
                aria-invalid={Boolean(errors.deliveryCenterId)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CENTER}>지정 안 함 (권역 규칙)</SelectItem>
                {deliveryCenters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {text('receiverName', '받는 사람', 4, { newRow: true })}
          {phone('receiverPhone', '받는 사람 연락처')}
          <Field
            label="배송 메모"
            span={12}
            error={errors.deliveryMemo}
            htmlFor={id('deliveryMemo')}
          >
            <Input
              {...props('deliveryMemo')}
              placeholder="예: 정문 경비실에 맡겨 주세요"
              value={value.deliveryMemo}
              onChange={(e) => set({ deliveryMemo: e.target.value })}
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
          ]}
          createRow={() => ({ ...EMPTY_CONTACT })}
          maxRows={MAX_CUSTOMER_CONTACTS}
          primary={{ key: 'isPrimary', label: '대표' }}
          errors={errors}
          addLabel="담당자 추가"
          countUnit="명"
          emptyText="등록된 담당자가 없습니다."
          disabled={disabled}
        />
      ),
    },
  ]

  // 수정 화면에서만: 상태 (바로 처리)
  if (customer) {
    sections.push({
      id: 'status',
      title: '상태',
      standalone: true,
      description: customer.isActive
        ? '사용 중지하면 새 출고에서 고를 수 없습니다. 기록은 남습니다.'
        : '사용 중지된 거래처입니다.',
      content: (
        <div className="flex flex-wrap items-center gap-3">
          {customer.isActive ? (
            <StatusBadge tone="success">사용</StatusBadge>
          ) : (
            <StatusBadge tone="danger">사용 중지</StatusBadge>
          )}
          {canToggleActive && (
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant={customer.isActive ? 'destructive' : 'outline'}
                  size="sm"
                >
                  <PowerIcon />
                  {customer.isActive ? '사용 중지' : '다시 사용'}
                </Button>
              }
              title={
                customer.isActive ? '이 거래처를 사용 중지할까요?' : '이 거래처를 다시 사용할까요?'
              }
              description={
                customer.isActive
                  ? '새 출고에서 고를 수 없게 됩니다. 기록은 그대로입니다.'
                  : '다시 고를 수 있게 됩니다.'
              }
              confirmLabel={customer.isActive ? '사용 중지' : '다시 사용'}
              destructive={customer.isActive}
              onConfirm={async () => {
                unwrap(
                  await setCustomersActiveAction({
                    ids: [customer.id],
                    isActive: !customer.isActive,
                  }),
                )
                router.refresh()
              }}
            />
          )}
        </div>
      ),
    })
  }

  return <MasterFormPage header={header} form={form} readOnly={readOnly} sections={sections} />
}
