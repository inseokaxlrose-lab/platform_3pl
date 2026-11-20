'use client'

import { useState, useTransition } from 'react'
import { TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import { DEFAULT_LOCATION_PATTERN } from '@/config/locations'
import {
  CenterSelect,
  CodeSelect,
  InheritableField,
  NumberInput,
  WarehouseSelect,
  YnToggle,
  ZoneSelect,
} from '@/components/inputs'
import { Field, FormGrid, type FieldSpan } from '@/components/master-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { suggestLocationCode } from '@/lib/locations/location-pattern'
import { locationCreateSchema, type LocationFormValue } from '@/lib/locations/location-schema'
import { cbmOf, cmToLength, kgToWeight, lengthToCm, weightToKg } from '@/lib/units/dimension'
import { createLocationAction, updateLocationAction } from './actions'
import type { LocationOptions } from './queries'

// 수정할 로케이션 (목록 줄에서)
export type EditingLocation = {
  id: string
  code: string
  rowVersion: number
  isSystem: boolean
  warehouseId: string
  input: Omit<LocationFormValue, 'warehouseId' | 'code'>
}

type OpKey = 'inbound' | 'outbound' | 'allocatable'
type DimKey = 'widthCm' | 'depthCm' | 'heightCm'

// 화면 값: 용량은 운영사 단위 글자 (저장할 때 cm·kg로 바꾼다)
type FormValue = LocationFormValue & { centerId: string; cbmEdited: boolean }

const EMPTY = (warehouseId = '', centerId = ''): FormValue => ({
  centerId,
  warehouseId,
  code: '',
  zoneId: '',
  description: '',
  locType: 'RACK',
  remark: '',
  rowNo: '',
  levelNo: '',
  widthCm: '',
  depthCm: '',
  heightCm: '',
  maxCbm: '',
  maxWeightKg: '',
  maxPalletCnt: null,
  inbound: null,
  outbound: null,
  allocatable: null,
  mixItem: true,
  mixLot: true,
  mixShipper: false,
  putawaySeq: null,
  pickSeq: null,
  cbmEdited: false,
})

// 로케이션 한 칸 추가·수정 팝업 (docs/decisions/0075) — 섹션: 기본 정보 / 위치 구성 / 용량 / 운영 속성
// - 추가: 센터 → 창고 → 구역을 고르고 열·단을 넣으면 창고 구분자로 코드를 제안한다 (직접 고칠 수 있다)
// - 수정: 코드·창고는 바꿀 수 없다. 시스템 기본 로케이션은 설명·비고만
// - 적치·피킹·할당 가능은 "창고 값 사용"이 기본 (NULL = 창고 값)
// - 용량은 운영사 단위(cm·inch, kg·lb)로 보여 주고 cm·kg로 저장한다. 가로·세로·높이를 넣으면 최대 부피를 계산한다
export function LocationDialog({
  options,
  open,
  onOpenChange,
  editing,
  initialWarehouseId,
  readOnly = false,
  onSaved,
}: {
  options: LocationOptions
  open: boolean
  onOpenChange: (open: boolean) => void
  // 있으면 수정, 없으면 추가
  editing: EditingLocation | null
  initialWarehouseId?: string
  readOnly?: boolean
  onSaved: () => void
}) {
  const { warehouses, zones, units } = options
  const addable = warehouses.filter((w) => w.addable)
  const [value, setValue] = useState<FormValue>(EMPTY())
  const [codeEdited, setCodeEdited] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // 팝업을 열 때마다 그 로케이션(또는 빈 값)으로 다시 채운다
  const openKey = open ? (editing?.id ?? 'new') : null
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  if (openKey !== openedFor) {
    setOpenedFor(openKey)
    if (openKey !== null) {
      setErrors({})
      setMessage(null)
      setCodeEdited(false)
      if (editing) {
        const w = warehouses.find((x) => x.id === editing.warehouseId)
        setValue({
          ...EMPTY(editing.warehouseId, w?.centerId ?? ''),
          ...editing.input,
          code: editing.code,
          // 저장 값(cm·kg) → 화면 단위
          widthCm: cmToLength(editing.input.widthCm, units.length),
          depthCm: cmToLength(editing.input.depthCm, units.length),
          heightCm: cmToLength(editing.input.heightCm, units.length),
          maxWeightKg: kgToWeight(editing.input.maxWeightKg, units.weight),
          // 저장된 부피가 있으면 그 값을 지키고, 없으면 가로·세로·높이로 계산한다
          cbmEdited: editing.input.maxCbm !== '',
        })
      } else {
        const w = addable.find((x) => x.id === initialWarehouseId)
        setValue(EMPTY(w?.id ?? '', w?.centerId ?? ''))
      }
    }
  }

  const warehouse = warehouses.find((w) => w.id === value.warehouseId)
  const isSystem = editing?.isSystem ?? false
  const disabled = readOnly || pending
  // 시스템 기본 로케이션은 설명·비고만
  const locked = disabled || isSystem

  // 값 바꾸기: 구역·열·단이 바뀌면 (코드를 직접 고치지 않았을 때) 코드를 다시 제안
  function set(patch: Partial<FormValue>) {
    setValue((prev) => {
      const next = { ...prev, ...patch }
      if (
        !editing &&
        !codeEdited &&
        ('zoneId' in patch || 'rowNo' in patch || 'levelNo' in patch)
      ) {
        const pattern =
          warehouse?.separator === '' ? '{ZONE}{ROW}{LEVEL}' : DEFAULT_LOCATION_PATTERN
        next.code = suggestLocationCode(pattern, {
          zone: zones.find((z) => z.id === next.zoneId)?.code,
          row: next.rowNo ?? '',
          level: next.levelNo ?? '',
        })
      }
      // 가로·세로·높이 → 최대 부피 (직접 고치지 않았을 때만)
      if (!next.cbmEdited && ('widthCm' in patch || 'depthCm' in patch || 'heightCm' in patch)) {
        next.maxCbm = cbmOf(
          lengthToCm(next.widthCm, units.length),
          lengthToCm(next.depthCm, units.length),
          lengthToCm(next.heightCm, units.length),
        )
      }
      return next
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    // 화면 단위 → cm·kg
    const payload = {
      ...value,
      widthCm: lengthToCm(value.widthCm, units.length),
      depthCm: lengthToCm(value.depthCm, units.length),
      heightCm: lengthToCm(value.heightCm, units.length),
      maxWeightKg: weightToKg(value.maxWeightKg, units.weight),
    }
    const parsed = locationCreateSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          [...parsed.error.issues].reverse().map((i) => [String(i.path[0]), i.message]),
        ),
      )
      setMessage('입력값을 확인해 주세요.')
      return
    }
    setErrors({})
    const { centerId, cbmEdited, warehouseId, code, ...data } = payload
    void centerId
    void cbmEdited
    startTransition(async () => {
      const result = editing
        ? await updateLocationAction({ id: editing.id, rowVersion: editing.rowVersion, ...data })
        : await createLocationAction({ warehouseId, code, ...data })
      if (!result.ok) {
        setMessage(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message)
        return
      }
      onOpenChange(false)
      onSaved()
    })
  }

  // 칸 도우미
  const id = (key: string) => `location-${key}`
  const text = (
    key: 'description' | 'rowNo' | 'levelNo',
    label: string,
    span: FieldSpan,
    opts: { placeholder?: string; maxLength?: number; lock?: boolean } = {},
  ) => (
    <Field label={label} span={span} error={errors[key]} htmlFor={id(key)}>
      <Input
        id={id(key)}
        value={value[key] ?? ''}
        onChange={(e) => set({ [key]: e.target.value })}
        placeholder={opts.placeholder}
        maxLength={opts.maxLength}
        disabled={opts.lock === false ? disabled : locked}
      />
    </Field>
  )
  const decimal = (
    key: DimKey | 'maxWeightKg' | 'maxCbm',
    label: string,
    unit: string,
    decimals: number,
    onChange?: (text: string) => void,
  ) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)}>
      <NumberInput
        id={id(key)}
        value={value[key] === '' || value[key] === undefined ? null : Number(value[key])}
        onChange={(n) => (onChange ?? ((t) => set({ [key]: t })))(n === null ? '' : String(n))}
        decimals={decimals}
        min={0}
        unit={unit}
        disabled={locked}
      />
    </Field>
  )
  const inherit = (key: OpKey, label: string) => {
    const parent = warehouse?.ops[key]
    return (
      <Field label={label} span={4} htmlFor={id(key)}>
        <InheritableField
          id={id(key)}
          parentLabel="창고"
          parentValue={warehouse ? (parent ? '가능' : '불가') : ''}
          inherited={value[key] === null}
          onInheritedChange={(inherited) => set({ [key]: inherited ? null : (parent ?? true) })}
          disabled={locked}
        >
          <YnToggle
            id={id(key)}
            value={value[key] ?? false}
            onChange={(checked) => set({ [key]: checked })}
            disabled={locked}
            onLabel="가능"
            offLabel="불가"
          />
        </InheritableField>
      </Field>
    )
  }
  const mix = (key: 'mixItem' | 'mixLot' | 'mixShipper', label: string, hint: string) => (
    <Field label={label} span={4} htmlFor={id(key)} hint={hint}>
      <YnToggle
        id={id(key)}
        value={value[key]}
        onChange={(v) => set({ [key]: v })}
        disabled={locked}
      />
    </Field>
  )
  const seq = (key: 'putawaySeq' | 'pickSeq' | 'maxPalletCnt', label: string, hint?: string) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)} hint={hint}>
      <NumberInput
        id={id(key)}
        value={value[key] ?? null}
        onChange={(n) => set({ [key]: n })}
        min={0}
        disabled={locked}
      />
    </Field>
  )
  const section = (title: string) => (
    <h3 className="col-span-12 border-l-2 border-primary pl-2 text-sm font-semibold">{title}</h3>
  )

  const lengthUnit = units.length.label
  const weightUnit = units.weight.label
  const tempZone = warehouse ? TEMP_ZONE.labels[warehouse.tempZone as TempZoneKey] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `로케이션 — ${editing.code}` : '로케이션 추가'}</DialogTitle>
            <DialogDescription>
              {editing
                ? isSystem
                  ? '시스템 기본 로케이션은 설명·비고만 고칠 수 있습니다.'
                  : `${warehouse?.centerLabel ?? ''} › ${warehouse?.label ?? ''} · 코드는 바꿀 수 없습니다.`
                : '코드는 등록 후 바꿀 수 없습니다. 여러 칸은 [일괄 생성]을 쓰세요.'}
            </DialogDescription>
          </DialogHeader>

          <FormGrid>
            {section('기본 정보')}
            {!editing && (
              <>
                <Field label="센터" span={4} required htmlFor={id('centerId')}>
                  <CenterSelect
                    id={id('centerId')}
                    options={[
                      ...new Map(
                        addable.map((w) => [
                          w.centerId,
                          { id: w.centerId, code: w.centerCode, name: w.centerName },
                        ]),
                      ).values(),
                    ]}
                    value={value.centerId}
                    onChange={(centerId) => set({ centerId, warehouseId: '', zoneId: '' })}
                    disabled={disabled}
                  />
                </Field>
                <Field
                  label="창고"
                  span={4}
                  required
                  error={errors.warehouseId}
                  htmlFor={id('warehouseId')}
                >
                  <WarehouseSelect
                    id={id('warehouseId')}
                    options={addable}
                    centerId={value.centerId}
                    value={value.warehouseId}
                    onChange={(warehouseId) => set({ warehouseId, zoneId: '' })}
                    disabled={disabled}
                    invalid={Boolean(errors.warehouseId)}
                  />
                </Field>
              </>
            )}
            <Field label="구역" span={4} error={errors.zoneId} htmlFor={id('zoneId')}>
              <ZoneSelect
                id={id('zoneId')}
                options={zones}
                warehouseId={value.warehouseId}
                value={value.zoneId ?? ''}
                onChange={(zoneId) => set({ zoneId })}
                disabled={locked}
                allowNone
              />
            </Field>
            <Field
              label="로케이션 코드"
              span={4}
              required
              newRow
              error={errors.code}
              htmlFor={id('code')}
              hint={editing ? '등록 후 바꿀 수 없습니다' : '구역·열·단을 넣으면 제안합니다'}
            >
              <Input
                id={id('code')}
                value={value.code}
                onChange={(e) => {
                  setCodeEdited(true)
                  set({ code: e.target.value.toUpperCase() })
                }}
                maxLength={30}
                placeholder="예: A-01-02"
                disabled={disabled || Boolean(editing)}
                aria-invalid={Boolean(errors.code)}
              />
            </Field>
            <Field
              label="로케이션 유형"
              span={4}
              required
              error={errors.locType}
              htmlFor={id('locType')}
            >
              <CodeSelect
                id={id('locType')}
                group="LOC_TYPE"
                value={value.locType}
                onChange={(locType) => set({ locType })}
                disabled={locked}
              />
            </Field>
            <Field label="설명" span={12} error={errors.description} htmlFor={id('description')}>
              <Input
                id={id('description')}
                value={value.description ?? ''}
                onChange={(e) => set({ description: e.target.value })}
                maxLength={200}
                placeholder="목록에서 코드 옆에 작게 보입니다 (예: 냉동실 입구 옆)"
                disabled={disabled}
              />
            </Field>
            <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
              <Textarea
                id={id('remark')}
                value={value.remark ?? ''}
                onChange={(e) => set({ remark: e.target.value })}
                rows={2}
                maxLength={1000}
                disabled={disabled}
              />
            </Field>

            {section('위치 구성')}
            {text('rowNo', '열', 4, { placeholder: '예: 01', maxLength: 10 })}
            {text('levelNo', '단', 4, { placeholder: '예: 02', maxLength: 10 })}

            {section(`용량 (${lengthUnit}·${weightUnit})`)}
            {decimal('widthCm', '가로', lengthUnit, 2)}
            {decimal('depthCm', '세로', lengthUnit, 2)}
            {decimal('heightCm', '높이', lengthUnit, 2)}
            {decimal('maxCbm', '최대 부피', 'CBM', 4, (t) => set({ maxCbm: t, cbmEdited: true }))}
            {decimal('maxWeightKg', '최대 중량', weightUnit, 2)}
            {seq('maxPalletCnt', '최대 팔레트 수')}

            {section('운영 속성')}
            <p className="col-span-12 text-xs text-muted-foreground">
              {warehouse
                ? `창고 설정: ${tempZone} · ${warehouse.bonded ? '보세' : '보세 아님'} · ${warehouse.hazmat ? '위험물' : '위험물 아님'} (온도대·보세·위험물은 창고를 따릅니다)`
                : '창고를 고르면 창고 설정(온도대·보세·위험물)이 보입니다.'}
            </p>
            {inherit('inbound', '적치 가능')}
            {inherit('outbound', '피킹 가능')}
            {inherit('allocatable', '출고 할당 가능')}
            {mix('mixItem', '다품목 혼적', '아니오면 한 칸에 한 품목')}
            {mix('mixLot', '다로트 혼적', '아니오면 한 칸에 한 로트')}
            {mix('mixShipper', '다화주 혼적', '3PL은 보통 아니오')}
            {seq('putawaySeq', '적치 순서', '적치 추천 동선')}
            {seq('pickSeq', '피킹 순서', '비우면 코드순')}
          </FormGrid>

          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? '닫기' : '취소'}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={pending}>
                {pending ? '저장 중…' : '저장'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
