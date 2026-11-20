'use client'

import Link from 'next/link'

import {
  AddressInput,
  BizNoInput,
  DateInput,
  EmailInput,
  InheritableField,
  LocationSelect,
  MultiSelect,
  NumberInput,
  PhoneInput,
  TimeInput,
  WeekdaySelect,
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
import { TEMP_ZONE } from '@/config/operator-codes'
import { EMPTY_CONTACT } from '@/lib/contacts/contact-schema'
import {
  CENTER_CONTACT_ROLE_GROUP,
  DEFAULT_WORK_DAYS,
  MAX_CENTER_CONTACTS,
  centerCreateSchema,
  withoutCode,
  type CenterCreateInput,
} from '@/lib/centers/center-schema'
import { CENTER_TYPE, isCenterSetupStatus } from '@/lib/centers/center-status'
import { createCenterAction, updateCenterAction } from './actions'
import type { CenterForEdit } from './queries'
import { AddWarehouseButton, WarehouseSummary } from './warehouse-summary'

const EMPTY: CenterCreateInput = {
  code: '',
  name: '',
  nameEn: '',
  shortName: '',
  type: 'LEASE',
  openedOn: '',
  businessNumber: '',
  subBizNo: '',
  sortOrder: 0,
  remark: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  addressJibun: '',
  regionName: '',
  phone: '',
  fax: '',
  email: '',
  directions: '',
  floorAreaM2: '',
  storageAreaM2: '',
  dockCount: null,
  tempZones: ['AMBIENT'],
  bondedYn: false,
  workStartTime: '',
  workEndTime: '',
  workDays: DEFAULT_WORK_DAYS,
  inboundCutoffTime: '',
  shipCutoffTime: '',
  defaultInboundLocId: '',
  defaultOutboundLocId: '',
  defaultReturnLocId: '',
  contacts: [],
}

type CenterFormProps = {
  // 페이지 헤더 (제목·설명·meta·보조 버튼)
  header: MasterFormHeader
  // 없으면 등록
  center?: CenterForEdit
  // 상속 칸에 보여 줄 운영사 값 (등록 화면. 수정은 center.operator)
  operator?: CenterForEdit['operator']
  // 수정(또는 등록) 권한이 없으면 읽기 전용
  readOnly: boolean
  // 창고 섹션: 조회 권한이면 창고로 이동, 등록 권한이면 [창고 추가]
  warehouseAccess?: { canView: boolean; canAdd: boolean }
  // 권역설정 섹션: 조회 권한이면 이 센터에 배정된 우편번호 수와 [권역설정으로]
  canViewRegions?: boolean
}

type TextKey = 'code' | 'name' | 'nameEn' | 'shortName' | 'subBizNo' | 'addressJibun' | 'regionName'
type TimeKey = 'workStartTime' | 'workEndTime' | 'inboundCutoffTime'
type LocationKey = 'defaultInboundLocId' | 'defaultOutboundLocId' | 'defaultReturnLocId'

// 센터 등록·수정 (docs/decisions/0026·0073, 입력 화면 틀 0031)
// 등록하면 [계속 등록]·[등록한 항목 보기], 수정은 그 자리에서 저장. 운영 상태는 헤더의 [상태 변경]에서 따로
export function CenterForm({
  header,
  center,
  operator = center?.operator,
  readOnly,
  warehouseAccess = { canView: false, canAdd: false },
  canViewRegions = false,
}: CenterFormProps) {
  // 저장 결과: 등록은 새 센터 키, 수정은 새 버전과 담당자 줄 키
  const form = useMasterForm<
    typeof centerCreateSchema,
    { id: string; rowVersion: number; contactIds?: string[] }
  >({
    initial: center ? { ...center.input, code: center.code } : EMPTY,
    version: center?.rowVersion,
    schema: centerCreateSchema,
    save: (value: CenterCreateInput, version) => {
      if (!center) return createCenterAction(value)
      // 센터코드는 바꿀 수 없어 보내지 않는다
      return updateCenterAction({
        id: center.id,
        rowVersion: version ?? center.rowVersion,
        ...withoutCode(value),
      })
    },
    // 새로 추가한 담당자 줄에 서버가 만든 키를 채운다 (다음 저장에서 같은 줄로 고치게)
    afterSave: (_saved, result, value) => {
      const ids = result.contactIds
      return ids
        ? { ...value, contacts: value.contacts.map((c, i) => ({ ...c, id: ids[i] ?? c.id })) }
        : value
    },
    createdHref: center ? undefined : (created) => `/admin/master/centers/${created.id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `center-${key}`
  const props = (key: string) => ({
    id: id(key),
    disabled,
    'aria-invalid': Boolean(errors[key]),
  })

  // 글자 한 칸
  const text = (
    key: TextKey,
    label: string,
    span: FieldSpan,
    options: {
      required?: boolean
      placeholder?: string
      hint?: string
      readOnly?: boolean
      maxLength?: number
    } = {},
  ) => (
    <Field
      label={label}
      span={span}
      required={options.required}
      error={errors[key]}
      htmlFor={id(key)}
      hint={options.hint}
    >
      <Input
        {...props(key)}
        disabled={disabled || options.readOnly}
        value={value[key] ?? ''}
        placeholder={options.placeholder}
        maxLength={options.maxLength}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </Field>
  )
  // 긴 글 (비고·찾아오는 길)
  const longText = (key: 'remark' | 'directions', label: string, placeholder?: string) => (
    <Field label={label} span={12} error={errors[key]} htmlFor={id(key)}>
      <Textarea
        {...props(key)}
        value={value[key]}
        rows={3}
        maxLength={1000}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </Field>
  )
  const phone = (key: 'phone' | 'fax', label: string, placeholder?: string) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)}>
      <PhoneInput
        {...props(key)}
        placeholder={placeholder}
        value={value[key]}
        onChange={(digits) => set({ [key]: digits })}
      />
    </Field>
  )
  // 면적 (소수 2자리, m²) — 값은 글자로 주고받는다 (DB Decimal)
  const area = (key: 'floorAreaM2' | 'storageAreaM2', label: string) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)}>
      <NumberInput
        {...props(key)}
        value={value[key] === '' ? null : Number(value[key])}
        onChange={(n) => set({ [key]: n === null ? '' : String(n) })}
        decimals={2}
        min={0}
        unit="m²"
      />
    </Field>
  )
  const time = (key: TimeKey, label: string, hint?: string) => (
    <Field label={label} span={3} error={errors[key]} htmlFor={id(key)} hint={hint}>
      <TimeInput {...props(key)} value={value[key]} onChange={(t) => set({ [key]: t })} />
    </Field>
  )
  const location = (key: LocationKey, label: string, required = false) => (
    <Field label={label} span={4} required={required} error={errors[key]} htmlFor={id(key)}>
      <LocationSelect
        id={id(key)}
        options={center?.locationOptions ?? []}
        value={value[key] ?? ''}
        onChange={(loc) => set({ [key]: loc })}
        disabled={disabled}
        invalid={Boolean(errors[key])}
      />
    </Field>
  )

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          {text('code', '센터코드', 4, {
            required: true,
            readOnly: Boolean(center),
            placeholder: '예: ICN01',
            hint: center ? '등록 후에는 바꿀 수 없습니다' : '영문 대문자·숫자, 등록 후 변경 불가',
            maxLength: 20,
          })}
          {text('name', '센터명', 8, { required: true, maxLength: 100 })}
          {text('nameEn', '영문명', 4, { hint: '해외 화주·서류용', maxLength: 100 })}
          {text('shortName', '약칭', 4, { hint: '목록·라벨에 짧게', maxLength: 30 })}
          <Field label="센터 유형" span={4} required error={errors.type} htmlFor={id('type')}>
            <Select value={value.type} onValueChange={(type) => set({ type })} disabled={disabled}>
              <SelectTrigger id={id('type')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CENTER_TYPE.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="개설일" span={4} error={errors.openedOn} htmlFor={id('openedOn')}>
            <DateInput
              {...props('openedOn')}
              value={value.openedOn}
              onChange={(openedOn) => set({ openedOn })}
            />
          </Field>
          <Field
            label="사업자등록번호"
            span={4}
            error={errors.businessNumber}
            htmlFor={id('businessNumber')}
            hint="운영사와 다를 때만"
          >
            <BizNoInput
              {...props('businessNumber')}
              value={value.businessNumber}
              onChange={(businessNumber) => set({ businessNumber })}
            />
          </Field>
          {text('subBizNo', '종사업장번호', 4, { placeholder: '0000', maxLength: 4 })}
          <Field
            label="정렬순서"
            span={4}
            error={errors.sortOrder}
            htmlFor={id('sortOrder')}
            hint="작을수록 목록 위"
          >
            <NumberInput
              {...props('sortOrder')}
              value={value.sortOrder}
              onChange={(n) => set({ sortOrder: n ?? 0 })}
              min={0}
              max={9999}
            />
          </Field>
          {longText('remark', '비고')}
        </FormGrid>
      ),
    },
    {
      id: 'location',
      title: '위치·연락처',
      description: '주소는 택배 집하·배차 기준이라 필수입니다.',
      content: (
        <FormGrid>
          <Field label="주소" span={12} required htmlFor={id('address-address')}>
            <AddressInput
              idPrefix={id('address')}
              value={{
                zipCode: value.zipCode,
                address: value.address,
                addressDetail: value.addressDetail,
              }}
              onChange={(address) => set(address)}
              onJibunAddress={(addressJibun) => set({ addressJibun })}
              onRegionName={(regionName) => set({ regionName })}
              disabled={disabled}
              errors={{
                zipCode: errors.zipCode,
                address: errors.address,
                addressDetail: errors.addressDetail,
              }}
            />
          </Field>
          {text('regionName', '지역', 4, {
            hint: '주소 검색으로 자동 입력 (예: 경기 이천시)',
            maxLength: 50,
          })}
          {text('addressJibun', '지번주소', 8, { hint: '주소 검색으로 자동 입력', maxLength: 200 })}
          {phone('phone', '대표 전화', '031-123-4567')}
          {phone('fax', '팩스')}
          <Field label="대표 이메일" span={4} error={errors.email} htmlFor={id('email')}>
            <EmailInput
              {...props('email')}
              value={value.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          {longText('directions', '찾아오는 길', '차량 진입로, 도크 위치 등 기사님 안내')}
        </FormGrid>
      ),
    },
    {
      id: 'facility',
      title: '시설 정보',
      content: (
        <FormGrid>
          {area('floorAreaM2', '연면적')}
          {area('storageAreaM2', '보관면적')}
          <Field label="도크 수" span={4} error={errors.dockCount} htmlFor={id('dockCount')}>
            <NumberInput
              {...props('dockCount')}
              value={value.dockCount}
              onChange={(dockCount) => set({ dockCount })}
              min={0}
              unit="개"
            />
          </Field>
          <Field
            label="취급 온도대"
            span={8}
            required
            error={errors.tempZones}
            htmlFor={id('tempZones')}
            hint="이 센터가 보관할 수 있는 온도대 (여러 개). 창고 온도대는 이 안에서 고릅니다"
          >
            <MultiSelect
              id={id('tempZones')}
              options={TEMP_ZONE.options}
              value={value.tempZones}
              onChange={(tempZones) => set({ tempZones })}
              placeholder="선택"
              disabled={disabled}
            />
          </Field>
          <Field label="보세 창고" span={4} htmlFor={id('bondedYn')} hint="보세 세부 정보는 API로">
            <YnToggle
              id={id('bondedYn')}
              value={value.bondedYn}
              onChange={(bondedYn) => set({ bondedYn })}
              disabled={disabled}
              onLabel="보세"
              offLabel="일반"
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'operation',
      title: '운영 설정',
      content: (
        <FormGrid>
          {time('workStartTime', '운영 시작')}
          {time('workEndTime', '운영 종료')}
          <Field label="운영 요일" span={6} error={errors.workDays} htmlFor={id('workDays')}>
            <WeekdaySelect
              id={id('workDays')}
              value={value.workDays}
              onChange={(workDays) => set({ workDays })}
              disabled={disabled}
            />
          </Field>
          {time('inboundCutoffTime', '입고 마감', '이후 도착은 다음 날 입고')}
          <Field
            label="출고 마감"
            span={3}
            error={errors.shipCutoffTime}
            htmlFor={id('shipCutoffTime')}
            hint="이후 주문은 다음 날 출고"
          >
            <InheritableField
              id={id('shipCutoffTime')}
              parentLabel="운영사"
              parentValue={operator?.shipCutoffTime ?? ''}
              inherited={value.shipCutoffTime === ''}
              onInheritedChange={(inherited) =>
                set({
                  shipCutoffTime: inherited ? '' : operator?.shipCutoffTime || '17:00',
                })
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
          {center ? (
            <>
              {location('defaultInboundLocId', '기본 입고 로케이션', true)}
              {location('defaultOutboundLocId', '기본 출고 로케이션')}
              {location('defaultReturnLocId', '기본 반품 로케이션')}
            </>
          ) : (
            <p className="col-span-12 text-sm text-muted-foreground">
              기본 입고·출고·반품 로케이션은 등록할 때 자동으로 만든 대기 창고의 DEFAULT로 정해지고,
              등록 후 바꿀 수 있습니다.
            </p>
          )}
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
              input: { codeGroup: CENTER_CONTACT_ROLE_GROUP },
            },
            { key: 'name', label: '담당자명', required: true, width: '8rem' },
            { key: 'phone', label: '연락처', width: '10rem', input: 'phone' },
            { key: 'email', label: '이메일', input: 'email' },
          ]}
          createRow={() => ({ ...EMPTY_CONTACT, id: '' })}
          maxRows={MAX_CENTER_CONTACTS}
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

  // 수정 화면에서만: 창고 목록, 권역설정 요약
  if (center) {
    // 창고·권역 추가는 준비중·운영중 센터만 (0073)
    const canSetup = isCenterSetupStatus(center.status)
    sections.push({
      id: 'warehouses',
      title: `창고 (${center.warehouses.length})`,
      standalone: true,
      description: '입고·출고·반품 대기 창고는 센터 등록 때 자동으로 만들어집니다.',
      action: warehouseAccess.canAdd && canSetup && <AddWarehouseButton centerId={center.id} />,
      content: (
        <WarehouseSummary warehouses={center.warehouses} canView={warehouseAccess.canView} />
      ),
    })
    // 권역설정 요약 (0076): 이 센터가 배송을 맡은 우편번호 수 (온도대별)
    if (canViewRegions) {
      const total = center.regionAssignments.reduce((sum, r) => sum + r.count, 0)
      sections.push({
        id: 'regions',
        title: `권역설정 (우편번호 ${total.toLocaleString()}개)`,
        standalone: true,
        description:
          '이 센터가 배송을 맡은 우편번호입니다. 권역설정 화면에서 지역·우편번호 단위로 정합니다.',
        action: (
          <Button asChild type="button" variant="outline" size="sm">
            <Link href="/admin/master/regions">권역설정으로</Link>
          </Button>
        ),
        content:
          total === 0 ? (
            <p className="text-sm text-muted-foreground">배정된 우편번호가 없습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 text-sm">
              {center.regionAssignments.map((r) => (
                <li key={r.tempZone} className="rounded-md border px-3 py-1">
                  {r.tempZone === 'ALL'
                    ? '전체 온도대'
                    : TEMP_ZONE.labels[r.tempZone as keyof typeof TEMP_ZONE.labels]}{' '}
                  <span className="font-medium">{r.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ),
      })
    }
  }

  return <MasterFormPage header={header} form={form} readOnly={readOnly} sections={sections} />
}
