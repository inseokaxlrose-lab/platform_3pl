'use client'

import { PlusIcon, PowerIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmDialog, ExternalCodesFields, StatusBadge } from '@/components/common'
import { AddressInput, PhoneInput } from '@/components/inputs'
import {
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
import { unwrap } from '@/lib/actions'
import { centerSchema, type CenterData, type CenterInput } from '@/lib/centers/center-schema'
import { summarizeRegions } from '@/lib/delivery-zones/regions'
import { EMPTY_EXTERNAL_CODES } from '@/lib/master-code/external-codes-schema'
import { createCenterAction, setCenterActiveAction, updateCenterAction } from './actions'
import type { CenterForEdit } from './queries'
import { AddWarehouseButton, WarehouseSummary } from './warehouse-summary'

const EMPTY: CenterInput = {
  code: '',
  name: '',
  phone: '',
  fax: '',
  managerName: '',
  managerPhone: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  externalCodes: { ...EMPTY_EXTERNAL_CODES },
}

// 저장한 값(빈 칸 null, 코드 대문자) → 입력값
function toFormValues(data: CenterData): CenterInput {
  const text = (value: string | null) => value ?? ''
  return {
    code: data.code,
    name: data.name,
    phone: text(data.phone),
    fax: text(data.fax),
    managerName: text(data.managerName),
    managerPhone: text(data.managerPhone),
    zipCode: text(data.zipCode),
    address: text(data.address),
    addressDetail: text(data.addressDetail),
    externalCodes: { ...EMPTY_EXTERNAL_CODES, ...data.externalCodes },
  }
}

type CenterFormProps = {
  // 페이지 헤더 (제목·설명·meta·보조 버튼)
  header: MasterFormHeader
  // 없으면 등록
  center?: CenterForEdit
  // 수정(또는 등록) 권한이 없으면 읽기 전용
  readOnly: boolean
  // 사용 중지/다시 사용 가능 여부 (운영사 + 수정 권한)
  canToggleActive?: boolean
  // 창고 섹션: 조회 권한이면 창고로 이동, 등록 권한이면 [창고 추가]
  warehouseAccess?: { canView: boolean; canAdd: boolean }
  // 배송권역 섹션: 조회 권한이면 섹션을 보여주고 권역으로 이동, 등록 권한이면 [권역 추가]
  zoneAccess?: { canView: boolean; canAdd: boolean }
}

// 센터 등록·수정 (docs/decisions/0026, 입력 화면 틀 0031)
// 등록하면 수정 화면으로 이동, 수정은 그 자리에서 저장. 상태·창고는 따로 처리하는 섹션
export function CenterForm({
  header,
  center,
  readOnly,
  canToggleActive = false,
  warehouseAccess = { canView: false, canAdd: false },
  zoneAccess = { canView: false, canAdd: false },
}: CenterFormProps) {
  const router = useRouter()
  const form = useMasterForm({
    initial: center?.input ?? EMPTY,
    schema: centerSchema,
    save: (value: CenterInput) =>
      center ? updateCenterAction({ id: center.id, ...value }) : createCenterAction(value),
    afterSave: toFormValues,
    onSuccess: center
      ? undefined
      : (created) => router.push(`/admin/master/centers/${(created as { id: string }).id}`),
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `center-${key}`
  const props = (key: string) => ({
    id: id(key),
    disabled,
    'aria-invalid': Boolean(errors[key]),
  })

  const text = (
    key: 'code' | 'name' | 'managerName',
    label: string,
    span: FieldSpan,
    options: { required?: boolean; placeholder?: string; newRow?: boolean } = {},
  ) => (
    <Field
      label={label}
      span={span}
      required={options.required}
      newRow={options.newRow}
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
  const phone = (key: 'phone' | 'fax' | 'managerPhone', label: string, placeholder?: string) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)}>
      <PhoneInput
        {...props(key)}
        placeholder={placeholder}
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
          {text('name', '센터명', 8, { required: true })}
          {text('code', '센터 코드', 4, { placeholder: '비우면 시스템 코드 사용' })}
          <Field
            label="시스템 코드"
            span={4}
            htmlFor={id('system-code')}
            hint="라벨·이력에 쓰는 바뀌지 않는 코드"
          >
            <Input
              id={id('system-code')}
              value={center?.systemCode ?? '저장하면 자동으로 부여됩니다'}
              disabled
              readOnly
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
          {phone('phone', '대표 전화', '031-123-4567')}
          {phone('fax', '팩스')}
          {text('managerName', '센터장', 4, { newRow: true })}
          {phone('managerPhone', '센터장 연락처', '010-1234-5678')}
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
      id: 'external',
      title: '외부 코드',
      description: 'SAP·ERP 등과 연동할 때 그쪽의 센터 코드를 적습니다.',
      content: (
        <FormGrid>
          <ExternalCodesFields
            idPrefix="center"
            value={{ ...EMPTY_EXTERNAL_CODES, ...value.externalCodes }}
            onChange={(externalCodes) => set({ externalCodes })}
            disabled={disabled}
            errors={{ SAP: errors['externalCodes.SAP'], ERP: errors['externalCodes.ERP'] }}
          />
        </FormGrid>
      ),
    },
  ]

  // 수정 화면에서만: 상태(바로 처리), 창고 목록
  if (center) {
    sections.push(
      {
        id: 'status',
        title: '상태',
        standalone: true,
        description: center.isActive
          ? '사용 중지하면 소속 직원의 데이터 범위에서 빠집니다.'
          : '사용 중지된 센터입니다.',
        content: (
          <div className="flex flex-wrap items-center gap-3">
            {center.isActive ? (
              <StatusBadge tone="success">사용</StatusBadge>
            ) : (
              <StatusBadge tone="danger">사용 중지</StatusBadge>
            )}
            {canToggleActive && (
              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant={center.isActive ? 'destructive' : 'outline'}
                    size="sm"
                  >
                    <PowerIcon />
                    {center.isActive ? '사용 중지' : '다시 사용'}
                  </Button>
                }
                title={
                  center.isActive ? '이 센터를 사용 중지할까요?' : '이 센터를 다시 사용할까요?'
                }
                description={
                  center.isActive
                    ? '소속 직원은 이 센터의 데이터를 볼 수 없게 됩니다. 기록은 남습니다.'
                    : '소속 직원이 다시 이 센터의 데이터를 볼 수 있게 됩니다.'
                }
                confirmLabel={center.isActive ? '사용 중지' : '다시 사용'}
                destructive={center.isActive}
                onConfirm={async () => {
                  unwrap(await setCenterActiveAction({ id: center.id, isActive: !center.isActive }))
                  router.refresh()
                }}
              />
            )}
          </div>
        ),
      },
      {
        id: 'warehouses',
        title: `창고 (${center.warehouses.length})`,
        standalone: true,
        description: '입고대기 창고는 센터 등록 때 자동으로 만들어집니다.',
        action: warehouseAccess.canAdd && center.isActive && (
          <AddWarehouseButton centerId={center.id} />
        ),
        content: (
          <WarehouseSummary warehouses={center.warehouses} canView={warehouseAccess.canView} />
        ),
      },
    )
    // 배송권역 요약 (0033)
    if (zoneAccess.canView) {
      sections.push({
        id: 'delivery-zones',
        title: `배송권역 (${center.deliveryZones.length})`,
        standalone: true,
        description: '이 센터가 배송을 담당하는 지역입니다.',
        action: zoneAccess.canAdd && center.isActive && (
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/admin/master/delivery-zones/new?centerId=${center.id}`}>
              <PlusIcon />
              권역 추가
            </Link>
          </Button>
        ),
        content:
          center.deliveryZones.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 배송권역이 없습니다.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {center.deliveryZones.map((z) => (
                <li key={z.id}>
                  <Link
                    href={`/admin/master/delivery-zones/${z.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {z.name} <span className="text-muted-foreground">({z.code})</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {summarizeRegions(z.regionCodes, 4)}
                      </p>
                    </div>
                    {!z.isActive && <StatusBadge tone="danger">사용 중지</StatusBadge>}
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
