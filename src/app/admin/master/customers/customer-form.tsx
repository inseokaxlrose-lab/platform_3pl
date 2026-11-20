'use client'

import { PowerIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { formatDate } from '@/components/data-grid'
import {
  AddressInput,
  BizNoInput,
  CodeSelect,
  EmailInput,
  NumberInput,
  PhoneInput,
} from '@/components/inputs'
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
import {
  CUSTOMER_STATUS,
  DATA_SOURCE,
  ORDER_ADDR_MODE,
  CUSTOMER_TYPE_GROUP,
} from '@/lib/customers/customer-codes'
import type { CustomerForEdit, CustomerShipperOption } from '@/lib/customers/customer-queries'
import {
  CONTACT_ROLE_GROUP,
  customerCreateSchema,
  EMPTY_CONTACT,
  MAX_CUSTOMER_CONTACTS,
  type CustomerCreateInput,
} from '@/lib/customers/customer-schema'
import { createCustomerAction, setCustomersStatusAction, updateCustomerAction } from './actions'
import { ShipToSection } from './ship-to-section'

const EMPTY: CustomerCreateInput = {
  shipperId: '',
  code: '',
  custCode: '',
  name: '',
  shortName: '',
  customerType: '',
  customerGroup: '',
  businessNumber: '',
  ceoName: '',
  orderAddrMode: 'SHIP_TO',
  phone: '',
  fax: '',
  email: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  addressJibun: '',
  regionCode: '',
  minShelfDays: null,
  minShelfRatio: '',
  remark: '',
  contacts: [],
  shipTos: [],
}

type TextKey = 'code' | 'custCode' | 'name' | 'shortName' | 'customerGroup' | 'ceoName'

// 거래처 등록·수정 (docs/decisions/0043, 0082 — 입력 화면 틀 0031)
// - 거래처코드: 비우면 자동 체번({화주 접두어}C000001), 등록 후 바꿀 수 없다. 사용자 정의 코드는 화주 시스템 코드 (0084)
// - 납품처: 표 + 드로어로 고치고, 아래 [저장] 한 번에 거래처와 함께 저장한다 (배송센터는 저장할 때 정한다)
// - 저장한 뒤에는 화면을 새로 읽어 납품처 키·배송센터 지정 결과를 다시 보여 준다 (페이지가 key=rowVersion으로 다시 그린다)
export function CustomerForm({
  header,
  shippers,
  customer,
  readOnly,
  canChangeStatus = false,
}: {
  header: MasterFormHeader
  // 등록할 때 고를 화주사 (범위 안의 준비중·운영중 화주사)
  shippers: CustomerShipperOption[]
  // 없으면 등록
  customer?: CustomerForEdit
  readOnly: boolean
  canChangeStatus?: boolean
}) {
  const router = useRouter()
  const form = useMasterForm({
    initial: customer
      ? { ...customer.input, shipperId: customer.shipperId, code: customer.code }
      : EMPTY,
    version: customer?.rowVersion,
    schema: customerCreateSchema,
    save: (value: CustomerCreateInput, version) => {
      if (!customer) return createCustomerAction(value)
      // 수정: 화주사·거래처코드는 보내지 않는다 (바꿀 수 없다)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { shipperId, code, ...rest } = value
      return updateCustomerAction({
        ...rest,
        id: customer.id,
        rowVersion: version ?? customer.rowVersion,
      })
    },
    createdHref: customer
      ? undefined
      : (created) => `/admin/master/customers/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  // 배송센터로 고를 수 있는 센터: 수정은 그 거래처의 화주사, 등록은 고른 화주사의 이용 센터
  const shipperId = customer?.shipperId ?? value.shipperId
  const deliveryCenters =
    customer?.deliveryCenters ?? shippers.find((s) => s.id === value.shipperId)?.centers ?? []
  const customerAddress = [value.address, value.addressDetail].filter(Boolean).join(' ')
  // 납품처 표 아래에 보일 오류 (shipTos 전체 규칙·줄 오류 중 첫 번째)
  const shipToError = Object.entries(errors).find(([key]) => key.startsWith('shipTos'))?.[1]
  const id = (key: string) => `customer-${key}`
  const props = (key: string) => ({
    id: id(key),
    disabled,
    'aria-invalid': Boolean(errors[key]),
  })

  const text = (
    key: TextKey,
    label: string,
    span: FieldSpan,
    extra: {
      required?: boolean
      placeholder?: string
      newRow?: boolean
      hint?: string
      locked?: boolean
    } = {},
  ) => (
    <Field
      label={label}
      span={span}
      required={extra.required}
      newRow={extra.newRow}
      hint={extra.hint}
      error={errors[key]}
      htmlFor={id(key)}
    >
      <Input
        {...props(key)}
        disabled={disabled || extra.locked}
        value={value[key] ?? ''}
        placeholder={extra.placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </Field>
  )
  const phone = (key: 'phone' | 'fax', label: string) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)}>
      <PhoneInput
        {...props(key)}
        value={value[key] ?? ''}
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
                // 화주사를 바꾸면 직접 고른 배송센터는 지운다 (이용 센터가 다르다)
                onValueChange={(next) =>
                  set({
                    shipperId: next,
                    shipTos: value.shipTos.map((s) => ({
                      ...s,
                      centerMode: 'AUTO',
                      deliveryCenterId: '',
                    })),
                  })
                }
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
          {text('code', '거래처코드', 3, {
            newRow: true,
            placeholder: '비워 두면 자동 생성',
            hint: customer ? '바꿀 수 없습니다' : '등록 후 바꿀 수 없습니다',
            locked: Boolean(customer),
          })}
          {text('custCode', '사용자 정의 코드', 3, { hint: '화주 시스템의 거래처코드 (선택)' })}
          {text('name', '거래처명', 8, { required: true, newRow: true })}
          {text('shortName', '약칭', 4)}
          <Field
            label="거래처 유형"
            span={4}
            error={errors.customerType}
            htmlFor={id('customerType')}
          >
            <CodeSelect
              id={id('customerType')}
              group={CUSTOMER_TYPE_GROUP}
              value={value.customerType ?? ''}
              onChange={(customerType) => set({ customerType })}
              disabled={disabled}
              invalid={Boolean(errors.customerType)}
              allowEmpty
            />
          </Field>
          {text('customerGroup', '거래처 그룹', 4, { placeholder: '예: 수도권 대리점' })}
          <Field
            label="주문 주소 사용"
            span={4}
            error={errors.orderAddrMode}
            htmlFor={id('orderAddrMode')}
          >
            <Select
              value={value.orderAddrMode}
              onValueChange={(orderAddrMode) => set({ orderAddrMode })}
              disabled={disabled}
            >
              <SelectTrigger id={id('orderAddrMode')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_ADDR_MODE.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="사업자등록번호"
            span={4}
            newRow
            error={errors.businessNumber}
            htmlFor={id('businessNumber')}
          >
            <BizNoInput
              {...props('businessNumber')}
              value={value.businessNumber ?? ''}
              onChange={(businessNumber) => set({ businessNumber })}
            />
          </Field>
          {text('ceoName', '대표자', 4)}
          <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
            <Textarea
              {...props('remark')}
              rows={2}
              value={value.remark ?? ''}
              onChange={(e) => set({ remark: e.target.value })}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'address',
      title: '주소·연락처',
      description:
        '거래처(본사) 주소입니다. 기본 납품처가 "거래처 주소와 동기화"이면 이 주소로 배송합니다.',
      content: (
        <FormGrid>
          <Field
            label="주소"
            span={12}
            required={value.shipTos.length === 0}
            htmlFor={id('address-address')}
          >
            <AddressInput
              idPrefix={id('address')}
              value={{
                zipCode: value.zipCode ?? '',
                address: value.address ?? '',
                addressDetail: value.addressDetail ?? '',
              }}
              onChange={(address) => set(address)}
              onRegionCode={(regionCode) => set({ regionCode })}
              onJibunAddress={(addressJibun) => set({ addressJibun })}
              disabled={disabled}
              errors={{
                zipCode: errors.zipCode,
                address: errors.address,
                addressDetail: errors.addressDetail,
              }}
            />
          </Field>
          {phone('phone', '대표 전화')}
          {phone('fax', '팩스')}
          <Field label="이메일" span={4} error={errors.email} htmlFor={id('email')}>
            <EmailInput
              {...props('email')}
              value={value.email ?? ''}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'ship-to',
      title: '납품처',
      description:
        '실제로 물건을 받는 곳입니다. 배송센터는 주소(권역설정)로 정하거나 직접 고르고, [저장]할 때 정해집니다.',
      content: (
        <ShipToSection
          rows={value.shipTos}
          info={customer?.shipToInfo ?? []}
          onChange={(shipTos) => set({ shipTos })}
          shipperId={shipperId}
          centers={deliveryCenters}
          customerAddress={customerAddress}
          isNewCustomer={!customer}
          disabled={disabled || !shipperId}
          error={shipToError}
        />
      ),
    },
    {
      id: 'shipping',
      title: '출고 조건',
      description:
        '유통기한이 이 기준보다 짧게 남은 재고는 이 거래처로 출고하지 않습니다 (출고 작업에서 적용).',
      content: (
        <FormGrid>
          <Field
            label="최소 잔여 유통기한"
            span={4}
            error={errors.minShelfDays}
            htmlFor={id('minShelfDays')}
          >
            <NumberInput
              {...props('minShelfDays')}
              value={value.minShelfDays ?? null}
              onChange={(minShelfDays) => set({ minShelfDays })}
              min={0}
              max={9999}
              unit="일"
            />
          </Field>
          <Field
            label="최소 잔여 비율"
            span={4}
            error={errors.minShelfRatio}
            htmlFor={id('minShelfRatio')}
            hint="전체 유통기한 중 남아야 하는 비율 (0~100)"
          >
            <Input
              {...props('minShelfRatio')}
              inputMode="decimal"
              placeholder="예: 70"
              value={value.minShelfRatio ?? ''}
              onChange={(e) => set({ minShelfRatio: e.target.value })}
            />
          </Field>
        </FormGrid>
      ),
    },
  ]

  // 수정 화면에서만: 연동 정보 (읽기 전용)
  if (customer) {
    sections.push({
      id: 'interface',
      title: '연동 정보',
      description: '어디서 등록했는지와 마지막 연동 기록입니다. 고칠 수 없습니다.',
      content: (
        <FormGrid>
          <Field label="등록 경로" span={4} htmlFor={id('source')}>
            <Input
              id={id('source')}
              value={
                DATA_SOURCE.labels[customer.source as keyof typeof DATA_SOURCE.labels] ??
                customer.source
              }
              disabled
              readOnly
            />
          </Field>
          <Field label="마지막 연동" span={4} htmlFor={id('lastIfAt')}>
            <Input
              id={id('lastIfAt')}
              value={
                customer.lastIfAt ? (formatDate(new Date(customer.lastIfAt), true) ?? '-') : '-'
              }
              disabled
              readOnly
            />
          </Field>
          <Field label="마지막 요청 ID" span={4} htmlFor={id('lastRequestId')}>
            <Input
              id={id('lastRequestId')}
              value={customer.lastRequestId ?? '-'}
              disabled
              readOnly
            />
          </Field>
        </FormGrid>
      ),
    })
  }

  sections.push({
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
  })

  // 수정 화면에서만: 상태 (바로 처리) — 거래중지는 신규 출고요청만 막는다
  if (customer) {
    const active = customer.status === 'ACTIVE'
    sections.push({
      id: 'status',
      title: '상태',
      standalone: true,
      description: active
        ? '거래중지하면 새 출고요청을 받지 않습니다. 진행 중인 주문은 그대로 처리합니다.'
        : '거래중지된 거래처입니다. 새 출고요청을 받지 않습니다.',
      content: (
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={active ? 'success' : 'warning'}>
            {CUSTOMER_STATUS.labels[customer.status as keyof typeof CUSTOMER_STATUS.labels] ??
              customer.status}
          </StatusBadge>
          {canChangeStatus && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant={active ? 'destructive' : 'outline'} size="sm">
                  <PowerIcon />
                  {active ? '거래중지' : '거래재개'}
                </Button>
              }
              title={active ? '이 거래처를 거래중지할까요?' : '이 거래처와 거래를 다시 할까요?'}
              description={
                active
                  ? '새 출고요청을 받지 않습니다. 진행 중인 주문은 그대로 처리합니다.'
                  : '새 출고요청을 다시 받습니다.'
              }
              confirmLabel={active ? '거래중지' : '거래재개'}
              destructive={active}
              onConfirm={async () => {
                unwrap(
                  await setCustomersStatusAction({
                    ids: [customer.id],
                    status: active ? 'SUSPENDED' : 'ACTIVE',
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
