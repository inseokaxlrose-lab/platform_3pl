'use client'

import { UserPlusIcon } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge } from '@/components/common'
import {
  AddressInput,
  BizNoInput,
  CenterSelect,
  CodeSelect,
  CorpRegNoInput,
  DateInput,
  EmailInput,
  InheritableField,
  NumberInput,
  PhoneInput,
  TimeInput,
  YnToggle,
} from '@/components/inputs'
import {
  EditableSubTable,
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type FieldSpan,
  type MasterFormSection,
  type MasterFormHeader,
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
import { ALLOC_RULE, BIZ_ENTITY, TAX_TYPE } from '@/config/operator-codes'
import { CONTACT_ROLE_GROUP, EMPTY_CONTACT } from '@/lib/contacts/contact-schema'
import {
  IF_METHOD,
  ORDER_NO_SCOPE,
  SHIP_TO_CENTER_POLICY,
  SHIPPER_CENTER_STATUS,
  SHORTAGE_POLICY,
} from '@/lib/shippers/shipper-codes'
import {
  LABEL_UNITS,
  MAX_SHIPPER_CONTACTS,
  SETTLE_CYCLE_GROUP,
  SHIPPER_INDUSTRY_GROUP,
  SHIPPER_TYPE_GROUP,
  shipperSchema,
  type ShipperCenterInput,
  type ShipperInput,
} from '@/lib/shippers/shipper-schema'
import { createShipperAction, updateShipperAction } from './actions'
import type { CenterChoice, OperatorDefaults, ShipperForEdit } from './queries'

// 오늘 날짜 'YYYY-MM-DD' (한국 시간 그대로 — UTC로 바꾸면 아침에는 어제가 된다)
const today = () => new Date().toLocaleDateString('sv-SE')

const EMPTY: ShipperInput = {
  code: '',
  name: '',
  nameEn: '',
  shortName: '',
  shipperType: '',
  industry: '',
  businessNumber: '',
  bizEntity: 'CORP',
  corpRegNo: '',
  subBizNo: '',
  taxType: 'GENERAL',
  ceoName: '',
  businessType: '',
  businessItem: '',
  sortOrder: 0,
  remark: '',
  phone: '',
  fax: '',
  email: '',
  homepageUrl: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  addressJibun: '',
  contractStartOn: today(),
  contractEndOn: '',
  autoRenew: true,
  settleCycle: 'MONTHLY',
  closingDay: null,
  paymentTermsDays: null,
  taxInvoiceEmail: '',
  // 운영 설정: 처음에는 모두 운영사 값을 따른다 (0080)
  useLot: null,
  useExpiry: null,
  useSerial: null,
  allocRule: null,
  shipCutoffTime: '',
  minInboundShelfDays: null,
  minOutboundShelfDays: null,
  partialShip: true,
  shortagePolicy: 'HOLD',
  labelUnit: 'PLT',
  shipToCenterPolicy: 'AUTO_HOLD',
  autoCreateShipTo: true,
  autoCreateItem: false,
  orderNoScope: 'CLIENT',
  ifMethod: 'PORTAL',
  apiEnabled: false,
  centers: [],
  contacts: [],
}

type ShipperFormProps = {
  // 페이지 헤더 (제목·설명·meta·보조 버튼)
  header: MasterFormHeader
  // 없으면 등록
  shipper?: ShipperForEdit
  centers: CenterChoice[]
  // 상속 칸의 위 단계 값 (운영사)
  operator: OperatorDefaults | null
  // 등록·수정 권한 + 운영사(전체 범위)가 아니면 읽기 전용
  readOnly: boolean
  // 소속 사용자 섹션: 사용자 메뉴 조회·등록 권한
  userAccess?: { canView: boolean; canAdd: boolean }
  // API 키 섹션 내용 (API 키 조회 권한이 있을 때만 page에서 넘긴다, 0081)
  apiKeys?: React.ReactNode
}

const LIST_HREF = '/admin/master/shippers'
type TextKey =
  | 'name'
  | 'code'
  | 'nameEn'
  | 'shortName'
  | 'subBizNo'
  | 'ceoName'
  | 'businessType'
  | 'businessItem'
  | 'homepageUrl'
type YnKey = 'autoRenew' | 'partialShip' | 'autoCreateShipTo' | 'autoCreateItem' | 'apiEnabled'
type InheritYnKey = 'useLot' | 'useExpiry' | 'useSerial'
type CountKey = 'paymentTermsDays' | 'minInboundShelfDays' | 'minOutboundShelfDays'
type ConstKey =
  'bizEntity' | 'taxType' | 'shortagePolicy' | 'shipToCenterPolicy' | 'orderNoScope' | 'ifMethod'
type CodeKey = 'shipperType' | 'industry' | 'settleCycle'
type Option = { value: string; label: string }

const closingDayText = (day: number | null | undefined) =>
  day === null || day === undefined ? '' : day === 99 ? '말일' : `${day}일`

// 화주사 등록·수정 (docs/decisions/0035·0080, 입력 화면 틀 0031)
// 등록하면 [계속 등록]·[등록한 항목 보기], 수정은 그 자리에서 저장. 상태는 헤더 [상태 변경], 소속 사용자는 따로 처리하는 섹션
export function ShipperForm({
  header,
  shipper,
  centers,
  operator,
  readOnly,
  userAccess = { canView: false, canAdd: false },
  apiKeys,
}: ShipperFormProps) {
  const form = useMasterForm({
    initial: shipper?.input ?? EMPTY,
    version: shipper?.rowVersion,
    schema: shipperSchema,
    save: (value: ShipperInput, version) =>
      shipper
        ? updateShipperAction({
            id: shipper.id,
            rowVersion: version ?? shipper.rowVersion,
            ...value,
          })
        : createShipperAction(value),
    createdHref: shipper
      ? undefined
      : (created) => `${LIST_HREF}/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `shipper-${key}`
  const props = (key: string) => ({ id: id(key), disabled, 'aria-invalid': Boolean(errors[key]) })

  // ── 칸 그리기 도우미 (같은 모양이 여러 번 나와서)
  const text = (
    key: TextKey,
    label: string,
    span: FieldSpan,
    options: { required?: boolean; placeholder?: string; hint?: string; newRow?: boolean } = {},
  ) => (
    <Field
      label={label}
      span={span}
      required={options.required}
      newRow={options.newRow}
      hint={options.hint}
      error={errors[key]}
      htmlFor={id(key)}
    >
      <Input
        {...props(key)}
        value={value[key]}
        placeholder={options.placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </Field>
  )
  const select = (
    key: ConstKey,
    label: string,
    options: Option[],
    span: FieldSpan = 4,
    hint?: string,
  ) => (
    <Field label={label} span={span} required hint={hint} error={errors[key]} htmlFor={id(key)}>
      <Select value={value[key]} onValueChange={(v) => set({ [key]: v })} disabled={disabled}>
        <SelectTrigger id={id(key)} className="w-full" aria-invalid={Boolean(errors[key])}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
  const code = (key: CodeKey, label: string, group: string, required = false) => (
    <Field label={label} span={4} required={required} error={errors[key]} htmlFor={id(key)}>
      <CodeSelect
        group={group}
        id={id(key)}
        value={value[key]}
        onChange={(v) => set({ [key]: v })}
        disabled={disabled}
        invalid={Boolean(errors[key])}
        allowEmpty={!required}
      />
    </Field>
  )
  const yn = (
    key: YnKey,
    label: string,
    hint?: string,
    labels: [string, string] = ['예', '아니오'],
  ) => (
    <Field label={label} span={4} hint={hint} htmlFor={id(key)}>
      <YnToggle
        id={id(key)}
        value={value[key]}
        onChange={(v) => set({ [key]: v })}
        disabled={disabled}
        onLabel={labels[0]}
        offLabel={labels[1]}
      />
    </Field>
  )
  // 상속 예/아니오: 체크하면 운영사 값, 풀면 이 화주사 값 (시작값은 운영사 값)
  const inheritYn = (key: InheritYnKey, label: string, hint: string) => {
    const parent = operator?.[key] ?? false
    return (
      <Field label={label} span={4} hint={hint} htmlFor={id(key)}>
        <InheritableField
          id={id(key)}
          parentLabel="운영사"
          parentValue={parent ? '사용' : '사용 안 함'}
          inherited={value[key] === null}
          onInheritedChange={(inherited) => set({ [key]: inherited ? null : parent })}
          disabled={disabled}
        >
          <YnToggle
            id={id(key)}
            value={value[key] ?? parent}
            onChange={(v) => set({ [key]: v })}
            disabled={disabled}
            onLabel="사용"
            offLabel="사용 안 함"
          />
        </InheritableField>
      </Field>
    )
  }
  const count = (key: CountKey, label: string, unit: string, hint?: string) => (
    <Field label={label} span={4} hint={hint} error={errors[key]} htmlFor={id(key)}>
      <NumberInput
        {...props(key)}
        value={value[key]}
        onChange={(n) => set({ [key]: n })}
        min={0}
        unit={unit}
      />
    </Field>
  )
  const phone = (key: 'phone' | 'fax', label: string) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)}>
      <PhoneInput
        {...props(key)}
        value={value[key]}
        onChange={(digits) => set({ [key]: digits })}
      />
    </Field>
  )
  const date = (
    key: 'contractStartOn' | 'contractEndOn',
    label: string,
    required: boolean,
    hint?: string,
  ) => (
    <Field
      label={label}
      span={4}
      required={required}
      hint={hint}
      error={errors[key]}
      htmlFor={id(key)}
    >
      <DateInput {...props(key)} value={value[key]} onChange={(v) => set({ [key]: v })} />
    </Field>
  )

  // 이용 센터 선택지: 준비중·운영중 센터 + (그 밖이어도) 이미 연결된 센터
  const usedCenterIds = value.centers.map((c) => c.centerId)
  const centerOptions = centers.filter((c) => c.isActive || usedCenterIds.includes(c.id))
  const emptyCenter = (): ShipperCenterInput => ({
    centerId: '',
    isDefault: false,
    startOn: today(),
    endOn: '',
    status: 'ACTIVE',
  })

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          {text('name', '화주사명', 8, { required: true })}
          {text('code', '화주사 코드', 4, { placeholder: '비우면 시스템 코드 사용' })}
          {text('nameEn', '영문명', 6)}
          {text('shortName', '약칭', 2, { hint: '목록·고르기 표시용' })}
          <Field label="시스템 코드" span={4} htmlFor={id('system-code')}>
            <Input
              id={id('system-code')}
              value={shipper?.systemCode ?? '저장하면 자동으로 부여됩니다'}
              disabled
              readOnly
            />
          </Field>
          {code('shipperType', '화주 유형', SHIPPER_TYPE_GROUP)}
          {code('industry', '업종', SHIPPER_INDUSTRY_GROUP)}
          <Field label="정렬순서" span={4} error={errors.sortOrder} htmlFor={id('sortOrder')}>
            <NumberInput
              {...props('sortOrder')}
              value={value.sortOrder}
              onChange={(n) => set({ sortOrder: n ?? 0 })}
              min={0}
              max={9999}
            />
          </Field>
          <Field
            label="사업자등록번호"
            span={4}
            required
            newRow
            hint="같은 회사의 사업부별 화주는 같은 번호를 쓸 수 있습니다"
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
          {value.bizEntity === 'CORP' ? (
            <Field label="법인등록번호" span={4} error={errors.corpRegNo} htmlFor={id('corpRegNo')}>
              <CorpRegNoInput
                {...props('corpRegNo')}
                value={value.corpRegNo}
                onChange={(corpRegNo) => set({ corpRegNo })}
              />
            </Field>
          ) : (
            <div className="hidden md:col-span-4 md:block" />
          )}
          {text('subBizNo', '종사업장번호', 4, { newRow: true })}
          {select('taxType', '과세유형', TAX_TYPE.options)}
          {text('ceoName', '대표자', 4)}
          {text('businessType', '업태', 6)}
          {text('businessItem', '종목', 6)}
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
          {phone('phone', '대표 전화')}
          {phone('fax', '팩스')}
          <Field label="대표 이메일" span={4} error={errors.email} htmlFor={id('email')}>
            <EmailInput
              {...props('email')}
              value={value.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          {text('homepageUrl', '홈페이지', 8, { placeholder: 'https://' })}
          <Field
            label="주소"
            span={12}
            hint="본사 주소 (반품 회수지 기본값으로도 씁니다)"
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
      description:
        '연락처와 이메일 중 하나는 필수, 담당자가 있으면 대표 1명을 정합니다. 연동 담당은 API 키 발급·만료 알림을 받는 사람으로 1명, 이메일이 필요합니다.',
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
            {
              key: 'isIfContact',
              label: '연동 담당',
              width: '5rem',
              // 한 명만: 고르면 다른 사람은 풀린다, 다시 누르면 풀린다
              render: ({ row, index, id: cellId, disabled: cellDisabled }) => (
                <label htmlFor={cellId} className="flex h-9 items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    id={cellId}
                    className="size-4 accent-primary"
                    checked={row.isIfContact === true}
                    disabled={cellDisabled}
                    onChange={(e) =>
                      set({
                        contacts: value.contacts.map((c, i) => ({
                          ...c,
                          isIfContact: i === index ? e.target.checked : false,
                        })),
                      })
                    }
                  />
                  연동
                </label>
              ),
            },
          ]}
          createRow={() => ({ ...EMPTY_CONTACT, isIfContact: false })}
          maxRows={MAX_SHIPPER_CONTACTS}
          primary={{ key: 'isPrimary', label: '대표' }}
          errors={errors}
          addLabel="담당자 추가"
          countUnit="명"
          emptyText="등록된 담당자가 없습니다."
          disabled={disabled}
        />
      ),
    },
    {
      id: 'centers',
      title: `이용 센터 (${value.centers.length})`,
      description:
        '이 화주사의 물건을 맡는 센터입니다. 1곳 이상, 기본 센터 1곳(ASN·주문에 센터가 없을 때 사용). 센터 직원은 자기 센터를 이용하는 화주사만 봅니다.',
      content: (
        <EditableSubTable
          name="centers"
          rows={value.centers}
          onChange={(rows) => set({ centers: rows })}
          columns={[
            {
              key: 'centerId',
              label: '센터',
              required: true,
              render: ({ value: centerId, onChange, id: cellId, invalid, disabled: d }) => (
                <CenterSelect
                  id={cellId}
                  options={centerOptions.filter(
                    (c) => c.id === centerId || !usedCenterIds.includes(c.id),
                  )}
                  value={centerId}
                  onChange={onChange}
                  invalid={invalid}
                  disabled={d}
                  autoSelectSingle={false}
                />
              ),
            },
            {
              key: 'startOn',
              label: '시작일',
              required: true,
              width: '9.5rem',
              render: ({ value: v, onChange, id: cellId, invalid, disabled: d }) => (
                <DateInput
                  id={cellId}
                  value={v}
                  onChange={onChange}
                  aria-invalid={invalid}
                  disabled={d}
                />
              ),
            },
            {
              key: 'endOn',
              label: '종료일',
              width: '9.5rem',
              render: ({ value: v, onChange, id: cellId, invalid, disabled: d }) => (
                <DateInput
                  id={cellId}
                  value={v}
                  onChange={onChange}
                  aria-invalid={invalid}
                  disabled={d}
                />
              ),
            },
            {
              key: 'status',
              label: '상태',
              width: '7rem',
              render: ({ value: v, onChange, id: cellId, disabled: d }) => (
                <Select value={v} onValueChange={onChange} disabled={d}>
                  <SelectTrigger id={cellId} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPPER_CENTER_STATUS.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
          ]}
          createRow={emptyCenter}
          maxRows={50}
          minRows={1}
          primary={{ key: 'isDefault', label: '기본' }}
          errors={errors}
          addLabel="센터 추가"
          countUnit="곳"
          emptyText="이용 센터를 추가해 주세요."
          disabled={disabled}
        />
      ),
    },
    {
      id: 'contract',
      title: '계약·정산',
      content: (
        <FormGrid>
          {date('contractStartOn', '계약시작일', true)}
          {date('contractEndOn', '계약종료일', false, '비우면 기한 없음')}
          {yn('autoRenew', '자동연장', '종료일이 지나면 같은 조건으로 연장')}
          {code('settleCycle', '정산 주기', SETTLE_CYCLE_GROUP, true)}
          <Field
            label="정산 마감일"
            span={4}
            hint="1~31일, 99 = 말일"
            error={errors.closingDay}
            htmlFor={id('closingDay')}
          >
            <InheritableField
              id={id('closingDay')}
              parentLabel="운영사"
              parentValue={closingDayText(operator?.closingDay)}
              inherited={value.closingDay === null}
              onInheritedChange={(inherited) =>
                set({ closingDay: inherited ? null : (operator?.closingDay ?? 99) })
              }
              disabled={disabled}
            >
              <NumberInput
                {...props('closingDay')}
                value={value.closingDay}
                onChange={(closingDay) => set({ closingDay })}
                min={1}
                max={99}
                unit="일"
              />
            </InheritableField>
          </Field>
          {count('paymentTermsDays', '결제 조건', '일', '마감 후 며칠 안에 결제')}
          <Field
            label="세금계산서 수신 이메일"
            span={8}
            error={errors.taxInvoiceEmail}
            htmlFor={id('taxInvoiceEmail')}
          >
            <EmailInput
              {...props('taxInvoiceEmail')}
              value={value.taxInvoiceEmail}
              onChange={(e) => set({ taxInvoiceEmail: e.target.value })}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'operation',
      title: '운영 설정',
      description:
        '"운영사 값 사용"이면 운영사 설정을 따릅니다. 센터별로 다르게 하려면 이용 센터에서(2차), 품목별로는 품목에서 정합니다.',
      content: (
        <FormGrid>
          <Field label="재고할당 규칙" span={4} error={errors.allocRule} htmlFor={id('allocRule')}>
            <InheritableField
              id={id('allocRule')}
              parentLabel="운영사"
              parentValue={operator?.allocRule ?? ''}
              inherited={value.allocRule === null}
              onInheritedChange={(inherited) =>
                set({ allocRule: inherited ? null : (operator?.allocRule ?? 'FIFO') })
              }
              disabled={disabled}
            >
              <Select
                value={value.allocRule ?? ''}
                onValueChange={(allocRule) => set({ allocRule })}
                disabled={disabled}
              >
                <SelectTrigger id={id('allocRule')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALLOC_RULE.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </InheritableField>
          </Field>
          <Field
            label="출고 마감시각"
            span={4}
            hint="이후 주문은 다음 날 출고"
            error={errors.shipCutoffTime}
            htmlFor={id('shipCutoffTime')}
          >
            <InheritableField
              id={id('shipCutoffTime')}
              parentLabel="운영사"
              parentValue={operator?.shipCutoffTime ?? ''}
              inherited={value.shipCutoffTime === ''}
              onInheritedChange={(inherited) =>
                set({ shipCutoffTime: inherited ? '' : operator?.shipCutoffTime || '17:00' })
              }
              disabled={disabled}
            >
              <TimeInput
                {...props('shipCutoffTime')}
                value={value.shipCutoffTime}
                onChange={(shipCutoffTime) => set({ shipCutoffTime })}
              />
            </InheritableField>
          </Field>
          <Field
            label="라벨 단위"
            span={4}
            required
            hint="입고 라벨을 붙이는 단위 (품목 기본값)"
            error={errors.labelUnit}
            htmlFor={id('labelUnit')}
          >
            <Select
              value={value.labelUnit}
              onValueChange={(labelUnit) =>
                set({ labelUnit: labelUnit as (typeof LABEL_UNITS)[number] })
              }
              disabled={disabled}
            >
              <SelectTrigger id={id('labelUnit')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit === 'PLT' ? 'PLT (팔레트)' : 'BOX (박스)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {inheritYn(
            'useLot',
            '로트 관리',
            '쓰면 입고 검수 때 로트번호 필수 (품목에서 다시 정할 수 있음)',
          )}
          {inheritYn(
            'useExpiry',
            '유통기한 관리',
            '쓰면 입고 검수 때 유통기한 필수 (품목에서 다시 정할 수 있음)',
          )}
          {inheritYn('useSerial', '시리얼 관리', '출고 작업에서 사용')}
          {count(
            'minInboundShelfDays',
            '입고 최소 잔여일',
            '일',
            '유통기한이 이보다 짧으면 입고 경고 (비우면 검사 안 함)',
          )}
          {count(
            'minOutboundShelfDays',
            '출고 최소 잔여일',
            '일',
            '이보다 짧은 재고는 출고 할당 제외 (비우면 검사 안 함)',
          )}
          {yn('partialShip', '부분출고 허용', '재고가 모자라면 있는 만큼 출고', [
            '허용',
            '허용 안 함',
          ])}
          {select('shortagePolicy', '재고 부족 시 처리', SHORTAGE_POLICY.options)}
        </FormGrid>
      ),
    },
    {
      id: 'policy',
      title: '거래처·주문 정책',
      description: '포털 등록과 API 연동에 똑같이 적용합니다. (거래처·주문 작업에서 사용)',
      content: (
        <FormGrid>
          {select('shipToCenterPolicy', '납품처 배송센터 미지정', SHIP_TO_CENTER_POLICY.options, 6)}
          {select('orderNoScope', '주문번호 중복 기준', ORDER_NO_SCOPE.options, 6)}
          {yn(
            'autoCreateShipTo',
            '주문 시 납품처 자동 등록',
            '등록되지 않은 납품처가 주소와 함께 오면 등록',
          )}
          {yn(
            'autoCreateItem',
            '미등록 품목 주문 허용',
            '허용하지 않으면 미등록 품목 주문은 반려',
            ['허용', '허용 안 함'],
          )}
        </FormGrid>
      ),
    },
    {
      id: 'interface',
      title: '연동',
      description:
        'API 사용을 끄면 키가 있어도 모든 API 호출을 거부합니다. 키는 아래 "API 키" 섹션에서 발급·관리합니다 (저장과 따로 바로 처리).',
      content: (
        <FormGrid>
          {select('ifMethod', '연동 방식', IF_METHOD.options, 4, '파일·EDI는 2차')}
          {yn('apiEnabled', 'API 사용', undefined, ['사용', '사용 안 함'])}
          <Field label="연동 담당자" span={4} htmlFor={id('if-contact')}>
            <Input
              id={id('if-contact')}
              value={
                value.contacts.find((c) => c.isIfContact)?.name ??
                '담당자 섹션에서 "연동"을 고릅니다'
              }
              disabled
              readOnly
            />
          </Field>
        </FormGrid>
      ),
    },
  ]

  if (shipper && apiKeys) {
    sections.push({
      id: 'api-keys',
      title: 'API 키',
      standalone: true,
      description:
        '화주 시스템이 연동 API를 부를 때 쓰는 키입니다. 키 원문은 발급 직후 한 번만 보이고, DB에는 해시만 남습니다.',
      content: apiKeys,
    })
  }

  if (shipper && userAccess.canView) {
    sections.push({
      id: 'users',
      title: `포털 사용자 (${shipper.users.length})`,
      standalone: true,
      description:
        '이 화주사 소속으로 화주 포털에 로그인하는 사용자입니다. 등록·수정은 사용자 메뉴에서 합니다.',
      action: userAccess.canAdd && (
        <Button asChild type="button" variant="outline" size="sm">
          <Link href="/admin/system/users/new">
            <UserPlusIcon />
            사용자 등록
          </Link>
        </Button>
      ),
      content:
        shipper.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">소속 사용자가 없습니다.</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {shipper.users.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/admin/system/users/${u.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50"
                >
                  <span>
                    <span className="font-medium">{u.name}</span>{' '}
                    <span className="text-muted-foreground">({u.username})</span>
                  </span>
                  {!u.isActive && <StatusBadge tone="danger">사용 중지</StatusBadge>}
                </Link>
              </li>
            ))}
          </ul>
        ),
    })
  }

  return <MasterFormPage header={header} form={form} readOnly={readOnly} sections={sections} />
}
