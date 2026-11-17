'use client'

import { PowerIcon, UserPlusIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import {
  AddressInput,
  BizNoInput,
  CheckboxList,
  EmailInput,
  PhoneInput,
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
import { unwrap } from '@/lib/actions'
import { CONTACT_ROLE_GROUP, EMPTY_CONTACT, MAX_CONTACTS } from '@/lib/contacts/contact-schema'
import {
  LABEL_UNITS,
  shipperSchema,
  type LabelUnitValue,
  type ShipperInput,
} from '@/lib/shippers/shipper-schema'
import { createShipperAction, setShippersActiveAction, updateShipperAction } from './actions'
import type { CenterChoice, ShipperForEdit } from './queries'

const EMPTY: ShipperInput = {
  code: '',
  name: '',
  businessNumber: '',
  ceoName: '',
  businessType: '',
  businessItem: '',
  phone: '',
  fax: '',
  email: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  centerIds: [],
  useLot: false,
  useExpiry: false,
  labelUnit: 'PLT',
  contacts: [],
}

type ShipperFormProps = {
  // 페이지 헤더 (제목·설명·meta·보조 버튼)
  header: MasterFormHeader
  // 없으면 등록
  shipper?: ShipperForEdit
  centers: CenterChoice[]
  // 등록·수정 권한 + 운영사(전체 범위)가 아니면 읽기 전용
  readOnly: boolean
  canToggleActive?: boolean
  // 소속 사용자 섹션: 사용자 메뉴 조회·등록 권한
  userAccess?: { canView: boolean; canAdd: boolean }
}

const LIST_HREF = '/admin/master/shippers'
type TextKey = 'name' | 'code' | 'ceoName' | 'businessType' | 'businessItem'

// 화주사 등록·수정 (docs/decisions/0035, 입력 화면 틀 0031)
// 등록하면 수정 화면으로, 수정은 그 자리에서 저장. 상태·소속 사용자는 따로 처리하는 섹션
export function ShipperForm({
  header,
  shipper,
  centers,
  readOnly,
  canToggleActive = false,
  userAccess = { canView: false, canAdd: false },
}: ShipperFormProps) {
  const router = useRouter()
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

  const text = (
    key: TextKey,
    label: string,
    span: FieldSpan,
    required = false,
    placeholder?: string,
  ) => (
    <Field label={label} span={span} required={required} error={errors[key]} htmlFor={id(key)}>
      <Input
        {...props(key)}
        value={value[key]}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
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

  // 이용 센터 선택지: 사용 중인 센터 + (사용 중지됐어도) 이미 연결된 센터
  const centerOptions = centers
    .filter((c) => c.isActive || value.centerIds.includes(c.id))
    .map((c) => ({ id: c.id, label: `${c.name} (${c.code})${c.isActive ? '' : ' · 사용 중지'}` }))

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          {/* 줄 1: 이름·코드 / 줄 2: 사업자번호·대표자·시스템 코드 / 줄 3: 업태·종목 */}
          {text('name', '화주사명', 8, true)}
          {text('code', '화주사 코드', 4, false, '비우면 시스템 코드 사용')}
          <Field
            label="사업자등록번호"
            span={4}
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
          <Field label="시스템 코드" span={4} htmlFor={id('system-code')}>
            <Input
              id={id('system-code')}
              value={shipper?.systemCode ?? '저장하면 자동으로 부여됩니다'}
              disabled
              readOnly
            />
          </Field>
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
          {phone('phone', '대표 전화')}
          {phone('fax', '팩스')}
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
      id: 'centers',
      title: `이용 센터 (${value.centerIds.length})`,
      description:
        '이 화주사의 물건을 맡는 센터입니다. 1곳 이상 고릅니다. 센터 직원은 자기 센터를 이용하는 화주사만 봅니다.',
      content: (
        <>
          <CheckboxList
            name="shipper-center"
            options={centerOptions}
            value={value.centerIds}
            onChange={(centerIds) => set({ centerIds })}
            disabled={disabled}
            emptyText="등록된 센터가 없습니다."
          />
          {errors.centerIds && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {errors.centerIds}
            </p>
          )}
        </>
      ),
    },
    {
      id: 'defaults',
      title: '품목 기본값',
      description:
        '이 화주사의 품목을 등록할 때 기본으로 쓰는 값입니다. 품목마다 다르게 정할 수도 있습니다.',
      content: (
        <FormGrid>
          <Field
            label="로트번호 사용"
            span={4}
            htmlFor={id('useLot')}
            hint="쓰면 입고 검수 때 로트번호가 필수입니다"
          >
            <YnToggle
              id={id('useLot')}
              value={value.useLot}
              onChange={(useLot) => set({ useLot })}
              disabled={disabled}
              onLabel="사용"
              offLabel="사용 안 함"
            />
          </Field>
          <Field
            label="유통기한 사용"
            span={4}
            htmlFor={id('useExpiry')}
            hint="쓰면 입고 검수 때 유통기한이 필수입니다"
          >
            <YnToggle
              id={id('useExpiry')}
              value={value.useExpiry}
              onChange={(useExpiry) => set({ useExpiry })}
              disabled={disabled}
              onLabel="사용"
              offLabel="사용 안 함"
            />
          </Field>
          <Field
            label="라벨 단위"
            span={4}
            required
            error={errors.labelUnit}
            htmlFor={id('labelUnit')}
            hint="입고 라벨을 붙이는 단위"
          >
            <Select
              value={value.labelUnit}
              onValueChange={(labelUnit) => set({ labelUnit: labelUnit as LabelUnitValue })}
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
          maxRows={MAX_CONTACTS}
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

  if (shipper) {
    sections.push({
      id: 'status',
      title: '상태',
      standalone: true,
      description: shipper.isActive
        ? '사용 중지하면 이 화주사 사용자는 포털에서 데이터를 볼 수 없게 됩니다.'
        : '사용 중지된 화주사입니다.',
      content: (
        <div className="flex flex-wrap items-center gap-3">
          {shipper.isActive ? (
            <StatusBadge tone="success">사용</StatusBadge>
          ) : (
            <StatusBadge tone="danger">사용 중지</StatusBadge>
          )}
          {canToggleActive && (
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant={shipper.isActive ? 'destructive' : 'outline'}
                >
                  <PowerIcon />
                  {shipper.isActive ? '사용 중지' : '다시 사용'}
                </Button>
              }
              title={
                shipper.isActive ? '이 화주사를 사용 중지할까요?' : '이 화주사를 다시 사용할까요?'
              }
              description={
                shipper.isActive
                  ? '소속 사용자는 데이터를 볼 수 없게 됩니다. 기록은 남습니다.'
                  : '소속 사용자가 다시 데이터를 볼 수 있게 됩니다.'
              }
              confirmLabel={shipper.isActive ? '사용 중지' : '다시 사용'}
              destructive={shipper.isActive}
              onConfirm={async () => {
                unwrap(
                  await setShippersActiveAction({ ids: [shipper.id], isActive: !shipper.isActive }),
                )
                router.refresh()
              }}
            />
          )}
        </div>
      ),
    })
    if (userAccess.canView) {
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
  }

  return <MasterFormPage header={header} form={form} readOnly={readOnly} sections={sections} />
}
