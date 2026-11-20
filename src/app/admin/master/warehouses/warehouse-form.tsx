'use client'

import { useState } from 'react'
import { STOCK_STATUS, TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import { CenterSelect, LocationSelect, NumberInput, YnToggle } from '@/components/inputs'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  WAREHOUSE_TYPE,
  WAREHOUSE_TYPE_DEFAULTS,
  type WarehouseTypeKey,
} from '@/lib/warehouses/warehouse-codes'
import { warehouseFormSchema, type WarehouseFormValue } from '@/lib/warehouses/warehouse-schema'
import { EMPTY_ZONE, ZONE_TYPE_GROUP, type ZoneRow } from '@/lib/zones/zone-schema'
import { createWarehouseAction, updateWarehouseAction } from './actions'
import type { CenterOption, WarehouseForEdit } from './queries'

type WarehouseFormProps = { header: MasterFormHeader } & (
  | {
      // 등록: 고를 수 있는 센터 + 미리 고른 센터
      mode: 'create'
      centers: CenterOption[]
      initialCenterId?: string
    }
  | {
      mode: 'edit'
      warehouse: WarehouseForEdit
      readOnly: boolean
    }
)

type Ops = Pick<WarehouseFormValue, 'inbound' | 'outbound' | 'allocatable' | 'defaultStockStatus'>
const OPS_KEYS = ['inbound', 'outbound', 'allocatable', 'defaultStockStatus'] as const

// 유형별 운영 속성 기본값 (화면 값 모양)
const opsOf = (type: string): Ops => {
  const ops = WAREHOUSE_TYPE_DEFAULTS[type as WarehouseTypeKey] ?? WAREHOUSE_TYPE_DEFAULTS.STORAGE
  return { ...ops }
}
const sameOps = (a: Ops, b: Ops) => OPS_KEYS.every((key) => a[key] === b[key])

// 센터 취급 온도대 → 기본 온도대 (하나면 그것, 상온이 있으면 상온)
const defaultTempZone = (zones: readonly string[]) =>
  zones.length === 1 ? zones[0] : zones.includes('AMBIENT') ? 'AMBIENT' : ''

// 창고 등록·수정 (docs/decisions/0027, 0074, 0075, 입력 화면 틀 0031)
// 섹션: 기본 정보 / 위치·시설 / 운영 속성 / 구역(수정에서만). 상태 변경·삭제는 헤더 버튼(warehouse-header-actions)
// - 유형을 고르면 운영 속성을 유형 기본값으로 채운다. 이미 고친 값이 있으면 바꿀지 묻는다
// - 시스템 기본 창고: 설명·정렬순서·비고만 고칠 수 있다
export function WarehouseForm(props: WarehouseFormProps) {
  const editing = props.mode === 'edit' ? props.warehouse : null
  const isSystem = editing?.isSystem ?? false
  const readOnly = props.mode === 'edit' && props.readOnly
  const centers = props.mode === 'create' ? props.centers : []

  const initialCenterId = props.mode === 'create' ? (props.initialCenterId ?? '') : ''
  const zonesOfCenter = (centerId: string) =>
    editing ? editing.center.tempZones : (centers.find((c) => c.id === centerId)?.tempZones ?? [])

  const form = useMasterForm({
    initial: editing
      ? editing.input
      : ({
          centerId: initialCenterId,
          code: '',
          name: '',
          custCode: '',
          type: 'STORAGE',
          tempZone: defaultTempZone(zonesOfCenter(initialCenterId)),
          description: '',
          sortOrder: 10,
          remark: '',
          buildingName: '',
          floorNo: '',
          areaM2: '',
          ...opsOf('STORAGE'),
          allocPriority: 100,
          defaultLocId: '',
        } satisfies WarehouseFormValue),
    version: editing?.rowVersion,
    schema: warehouseFormSchema,
    save: ({ centerId, code, zones, ...data }: WarehouseFormValue, version) =>
      editing
        ? updateWarehouseAction({
            id: editing.id,
            rowVersion: version ?? editing.rowVersion,
            ...data,
            // 시스템 기본 창고는 구역을 쓰지 않는다
            ...(!editing.isSystem && { zones }),
          })
        : createWarehouseAction({ centerId, code, ...data }),
    // 검사를 거친 값은 글자·키 모양이 바뀌므로 화면 값은 입력한 그대로 두고, 새 구역 줄에 키를 채운다
    afterSave: (_saved, result, value) => {
      const ids = result.zoneIds
      return ids && value.zones
        ? { ...value, zones: value.zones.map((z, i) => ({ ...z, id: ids[i] ?? z.id })) }
        : value
    },
    createdHref: editing
      ? undefined
      : (created) => `/admin/master/warehouses/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  // 시스템 기본 창고에서 잠그는 칸
  const locked = disabled || isSystem
  const id = (key: string) => `warehouse-${key}`

  // 유형 변경: 운영 속성을 아직 고치지 않았으면 바로 기본값, 고쳤으면 묻는다
  const [pendingType, setPendingType] = useState<string | null>(null)
  const changeType = (type: string) => {
    if (type === value.type) return
    if (sameOps(value, opsOf(value.type))) set({ type, ...opsOf(type) })
    else setPendingType(type)
  }

  const centerZones = zonesOfCenter(value.centerId)
  const tempZoneOptions = TEMP_ZONE.options.filter((o) => centerZones.includes(o.value))

  // 글자 한 칸
  type TextKey = 'name' | 'custCode' | 'description' | 'buildingName' | 'floorNo'
  const text = (
    key: TextKey,
    label: string,
    span: FieldSpan,
    options: { required?: boolean; placeholder?: string; lock?: boolean; maxLength?: number } = {},
  ) => (
    <Field
      label={label}
      span={span}
      required={options.required}
      error={errors[key]}
      htmlFor={id(key)}
    >
      <Input
        id={id(key)}
        value={value[key] ?? ''}
        disabled={options.lock ? locked : disabled}
        placeholder={options.placeholder}
        maxLength={options.maxLength}
        aria-invalid={Boolean(errors[key])}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </Field>
  )
  const yn = (key: 'inbound' | 'outbound' | 'allocatable', label: string, hint: string) => (
    <Field label={label} span={3} error={errors[key]} htmlFor={id(key)} hint={hint}>
      <YnToggle
        id={id(key)}
        value={value[key]}
        onChange={(checked) => set({ [key]: checked })}
        disabled={locked}
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
            label="센터"
            span={4}
            required
            error={errors.centerId}
            htmlFor={id('centerId')}
            hint={editing ? '센터는 등록 후 바꿀 수 없습니다.' : undefined}
          >
            {editing ? (
              <Input
                id={id('centerId')}
                value={`${editing.center.name} (${editing.center.code})`}
                disabled
                readOnly
              />
            ) : (
              <CenterSelect
                id={id('centerId')}
                options={centers}
                value={value.centerId}
                // 센터가 바뀌면 그 센터의 취급 온도대로 온도대를 다시 고른다
                onChange={(centerId) =>
                  set({ centerId, tempZone: defaultTempZone(zonesOfCenter(centerId)) })
                }
                disabled={disabled}
                invalid={Boolean(errors.centerId)}
              />
            )}
          </Field>
          <Field
            label="창고코드"
            span={3}
            required
            error={errors.code}
            htmlFor={id('code')}
            hint={editing ? '등록 후 바꿀 수 없습니다.' : '영문 대문자·숫자·밑줄(_)'}
          >
            <Input
              id={id('code')}
              value={value.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              disabled={disabled || Boolean(editing)}
              maxLength={20}
              placeholder="예: A, COLD1"
              aria-invalid={Boolean(errors.code)}
            />
          </Field>
          {text('name', '창고명', 5, {
            required: true,
            lock: true,
            maxLength: 100,
            placeholder: '예: A동 상온',
          })}
          {text('custCode', '사용자 정의 코드', 3, {
            maxLength: 50,
            placeholder: 'ERP 저장위치 코드 등 (선택)',
          })}
          <Field
            label="창고 유형"
            span={4}
            required
            newRow
            error={errors.type}
            htmlFor={id('type')}
            hint={
              isSystem
                ? '시스템 기본 창고는 유형을 바꿀 수 없습니다.'
                : '고르면 아래 운영 속성이 유형 기본값으로 채워집니다.'
            }
          >
            <Select value={value.type} onValueChange={changeType} disabled={locked}>
              <SelectTrigger id={id('type')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WAREHOUSE_TYPE.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="온도대"
            span={3}
            required
            error={errors.tempZone}
            htmlFor={id('tempZone')}
            hint="센터 취급 온도대 중에서"
          >
            <Select
              value={value.tempZone}
              onValueChange={(tempZone) => set({ tempZone })}
              disabled={locked || tempZoneOptions.length === 0}
            >
              <SelectTrigger
                id={id('tempZone')}
                className="w-full"
                aria-invalid={Boolean(errors.tempZone)}
              >
                <SelectValue placeholder={value.centerId ? '선택' : '센터를 먼저 고르세요'}>
                  {TEMP_ZONE.labels[value.tempZone as TempZoneKey]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tempZoneOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="정렬순서"
            span={2}
            required
            error={errors.sortOrder}
            htmlFor={id('sortOrder')}
            hint="작을수록 위"
          >
            <NumberInput
              id={id('sortOrder')}
              value={value.sortOrder}
              onChange={(n) => set({ sortOrder: n ?? 0 })}
              min={0}
              disabled={disabled}
            />
          </Field>
          {text('description', '설명', 12, {
            maxLength: 200,
            placeholder: '목록에서 코드 옆에 작게 보입니다',
          })}
          <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
            <Textarea
              id={id('remark')}
              value={value.remark ?? ''}
              rows={3}
              maxLength={1000}
              disabled={disabled}
              onChange={(e) => set({ remark: e.target.value })}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'facility',
      title: '위치·시설',
      content: (
        <FormGrid>
          {text('buildingName', '동', 3, {
            lock: true,
            maxLength: 50,
            placeholder: '예: A동, 본관',
          })}
          {text('floorNo', '층', 2, { lock: true, maxLength: 10, placeholder: '예: B1, 1' })}
          <Field label="면적" span={3} error={errors.areaM2} htmlFor={id('areaM2')}>
            <NumberInput
              id={id('areaM2')}
              value={value.areaM2 === '' ? null : Number(value.areaM2)}
              onChange={(n) => set({ areaM2: n === null ? '' : String(n) })}
              decimals={2}
              min={0}
              unit="m²"
              disabled={locked}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'operation',
      title: '운영 속성',
      description: isSystem
        ? '시스템 기본 창고의 운영 속성은 유형에 따라 정해져 있습니다.'
        : '유형을 고르면 기본값이 채워지고, 필요하면 고칠 수 있습니다.',
      content: (
        <FormGrid>
          {yn('inbound', '입고 가능', '입고 적치 대상')}
          {yn('outbound', '출고 가능', '출고 피킹 대상')}
          {yn('allocatable', '출고 할당 가능', '이 창고 재고를 주문에 할당')}
          <Field
            label="기본 재고상태"
            span={3}
            required
            error={errors.defaultStockStatus}
            htmlFor={id('defaultStockStatus')}
            hint="적치될 때의 재고상태"
          >
            <Select
              value={value.defaultStockStatus}
              onValueChange={(defaultStockStatus) => set({ defaultStockStatus })}
              disabled={locked}
            >
              <SelectTrigger id={id('defaultStockStatus')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_STATUS.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="할당 우선순위"
            span={2}
            required
            newRow
            error={errors.allocPriority}
            htmlFor={id('allocPriority')}
            hint="작을수록 먼저 (1~999)"
          >
            <NumberInput
              id={id('allocPriority')}
              value={value.allocPriority}
              onChange={(n) => set({ allocPriority: n ?? 100 })}
              min={1}
              max={999}
              disabled={locked}
            />
          </Field>
          {editing && (
            <Field
              label="기본 로케이션"
              span={4}
              error={errors.defaultLocId}
              htmlFor={id('defaultLocId')}
              hint="로케이션을 정하지 않고 적치할 때 쓰는 곳"
            >
              <LocationSelect
                id={id('defaultLocId')}
                options={[{ value: '', label: '(없음)' }, ...editing.locationOptions]}
                value={value.defaultLocId ?? ''}
                onChange={(defaultLocId) => set({ defaultLocId })}
                disabled={locked}
                placeholder="로케이션 선택"
              />
            </Field>
          )}
        </FormGrid>
      ),
    },
  ]

  // 구역 (0075): 수정 화면에서만, 시스템 기본 창고는 구역을 쓰지 않는다
  if (editing && !isSystem) {
    sections.push({
      id: 'zones',
      title: '구역',
      description:
        '같은 방식으로 운영하는 로케이션 묶음입니다 (예: A구역 랙 보관, P구역 피킹). 구역코드는 로케이션 코드 앞자리라 저장 후 바꿀 수 없고, 로케이션이 있는 구역은 지울 수 없습니다.',
      content: (
        <EditableSubTable<ZoneRow>
          name="zones"
          rows={(value.zones ?? []) as ZoneRow[]}
          onChange={(zones) => set({ zones })}
          columns={[
            {
              key: 'code',
              label: '구역코드',
              required: true,
              width: '7rem',
              // 저장된 구역의 코드는 잠근다
              render: (cell) => (
                <Input
                  id={cell.id}
                  value={cell.value}
                  onChange={(e) => cell.onChange(e.target.value.toUpperCase())}
                  maxLength={10}
                  disabled={cell.disabled || Boolean(cell.row.id)}
                  aria-invalid={cell.invalid}
                />
              ),
            },
            { key: 'name', label: '구역명', required: true },
            {
              key: 'type',
              label: '구역 유형',
              required: true,
              width: '8rem',
              input: { codeGroup: ZONE_TYPE_GROUP },
            },
            { key: 'pickSeq', label: '피킹 순서', width: '6rem' },
            { key: 'sortOrder', label: '정렬순서', required: true, width: '6rem' },
            {
              key: 'status',
              label: '상태',
              width: '7.5rem',
              render: (cell) => (
                <Select value={cell.value} onValueChange={cell.onChange} disabled={cell.disabled}>
                  <SelectTrigger id={cell.id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">사용</SelectItem>
                    <SelectItem value="INACTIVE">사용 중지</SelectItem>
                  </SelectContent>
                </Select>
              ),
            },
            {
              key: 'locationCount',
              label: '로케이션 수',
              width: '6rem',
              render: (cell) => (
                <span className="text-sm text-muted-foreground">{cell.row.locationCount}</span>
              ),
            },
          ]}
          createRow={() => ({ ...EMPTY_ZONE })}
          errors={errors}
          addLabel="구역 추가"
          countUnit="개"
          emptyText="등록된 구역이 없습니다. 로케이션 일괄 생성 전에 구역을 만드세요."
          disabled={disabled}
        />
      ),
    })
  }

  return (
    <>
      <MasterFormPage header={props.header} form={form} readOnly={readOnly} sections={sections} />
      {/* 유형을 바꿨는데 운영 속성을 이미 고친 경우: 유형 기본값으로 바꿀지 묻는다 */}
      <AlertDialog
        open={pendingType !== null}
        onOpenChange={(open) => !open && setPendingType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>운영 속성을 유형 기본값으로 바꿀까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingType &&
                `'${WAREHOUSE_TYPE.labels[pendingType as WarehouseTypeKey]}' 유형의 기본값: 입고 ${
                  opsOf(pendingType).inbound ? '가능' : '불가'
                } · 출고 ${opsOf(pendingType).outbound ? '가능' : '불가'} · 할당 ${
                  opsOf(pendingType).allocatable ? '가능' : '불가'
                } · 재고상태 ${
                  STOCK_STATUS.labels[
                    opsOf(pendingType).defaultStockStatus as keyof typeof STOCK_STATUS.labels
                  ]
                }`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (pendingType) set({ type: pendingType })
                setPendingType(null)
              }}
            >
              현재 값 유지
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingType) set({ type: pendingType, ...opsOf(pendingType) })
                setPendingType(null)
              }}
            >
              유형 기본값으로 바꾸기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
