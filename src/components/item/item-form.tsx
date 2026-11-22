'use client'

import { InfoIcon, PowerIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { formatDate } from '@/components/data-grid'
import { NumberInput, SearchSelect, YnToggle } from '@/components/inputs'
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
import { ALLOC_RULE, TEMP_ZONE } from '@/config/operator-codes'
import { unwrap } from '@/lib/actions'
import type { ActionResult } from '@/lib/actions/result'
import { calcPallet } from '@/lib/items/item-calc'
import {
  BARCODE_TYPE,
  EXPIRY_INPUT,
  EXPIRY_TYPE,
  ITEM_STATUS_BADGE,
  ITEM_STATUS,
  ITEM_TYPE,
  LOT_SOURCE,
  MAX_SET_COMPONENTS,
  SET_TYPE,
} from '@/lib/items/item-codes'
import type { ItemFormOptions } from '@/lib/items/item-form-options'
import {
  itemCreateSchema,
  MAX_ITEM_BARCODES,
  type ItemBarcodeInput,
  type ItemCreateInput,
  type ItemInput,
  type ItemSetComponentInput,
} from '@/lib/items/item-schema'
import type { SetComponentOption } from '@/lib/items/item-set-options'
import { LABEL_UNITS } from '@/lib/shippers/shipper-schema'
import { EMPTY_ITEM_INPUT, shipperItemStart } from '@/lib/items/item-defaults'
import { ItemPalletSection } from './item-pallet-section'
import { ItemUnitsSection } from './item-units-section'

// "선택 안 함"·"화주사 값 따름" (Select는 빈 글자를 값으로 못 쓴다)
const NONE = '__none__'

// 저장 결과 (등록·수정 모두 키와 새 버전을 돌려준다)
type SaveResult = { id: string; rowVersion: number }

// 수정 화면에 넘기는 품목 (조회 함수 결과)
export type ItemFormItem = {
  id: string
  code: string
  rowVersion: number
  status: string
  isActive: boolean
  source: string
  lastIfAt: Date | string | null
  shipperId: string
  // '가나식품 (GANA)'
  shipper: string
  // 재고·미완료 ASN 때문에 기본단위·관리 여부를 바꿀 수 없으면 그 이유
  structureLock: string | null
  input: ItemInput
}

type ItemFormProps = {
  header: MasterFormHeader
  // 폼 뒤에 붙일 따로 처리하는 섹션 (이미지처럼 바로 저장되는 것, 0091)
  extraSections?: MasterFormSection[]
  options: ItemFormOptions
  // 없으면 등록
  item?: ItemFormItem
  readOnly: boolean
  // 등록 후 이동할 수정 화면 주소의 앞부분 (운영사 화면 '/admin/master/items', 포털 '/portal/items')
  basePath: string
  // 화주 포털: 화주사를 고르지 않는다 (자기 화주사로 고정)
  fixedShipperId?: string
  canToggleActive?: boolean
  createAction: (input: ItemCreateInput) => Promise<ActionResult<SaveResult>>
  updateAction: (
    input: ItemInput & { id: string; rowVersion: number },
  ) => Promise<ActionResult<SaveResult>>
  setActiveAction: (input: { ids: string[]; isActive: boolean }) => Promise<ActionResult<unknown>>
  // 세트 구성품으로 고를 품목 (같은 화주사, 세트 제외 — 0098)
  loadComponentOptions: (input: {
    shipperId: string
  }) => Promise<ActionResult<SetComponentOption[]>>
}

// 품목 등록·수정 (docs/decisions/0041, 0083 — 입력 화면 틀 0031). 운영사 화면과 화주 포털이 같이 쓴다
// 섹션: 기본 정보 / 단위·규격 / 팔레트 적재 / 보관 조건 / 소비기한·LOT / 출고 조건 / 바코드 / 연동 정보 / 상태
export function ItemForm({
  header,
  options,
  item,
  readOnly,
  basePath,
  fixedShipperId,
  canToggleActive = false,
  createAction,
  updateAction,
  setActiveAction,
  loadComponentOptions,
  extraSections = [],
}: ItemFormProps) {
  const router = useRouter()
  // 새 품목: 화주사 설정을 기본값으로 복사 (기한·LOT·시리얼 — 이후 화주 설정이 바뀌어도 그대로, 0083)
  const shipperDefaults = (shipperId: string) => {
    const shipper = options.shippers.find((s) => s.id === shipperId)
    return shipper ? shipperItemStart(shipper) : {}
  }
  const initialShipper = fixedShipperId ?? ''
  const form = useMasterForm({
    initial: item
      ? { ...item.input, shipperId: item.shipperId, code: item.code }
      : {
          ...EMPTY_ITEM_INPUT,
          shipperId: initialShipper,
          palletTypeCode: options.defaultPalletType,
          ...shipperDefaults(initialShipper),
        },
    version: item?.rowVersion,
    schema: itemCreateSchema,
    save: (value: ItemCreateInput, version) => {
      if (!item) return createAction(value)
      // 수정: 화주사·품목코드는 보내지 않는다 (바꿀 수 없다)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { shipperId, code, ...rest } = value
      return updateAction({ ...rest, id: item.id, rowVersion: version ?? item.rowVersion })
    },
    createdHref: item ? undefined : (created) => `${basePath}/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const structureLock = item?.structureLock ?? null
  const id = (key: string) => `item-${key}`
  const shipper = options.shippers.find((s) => s.id === value.shipperId)
  const unitOf = (unitId: string) => options.units.find((u) => u.id === unitId)
  const baseUnit = unitOf(value.baseUnitId)

  // 팔레트 계산 미리보기 (서버와 같은 함수)
  const box = value.units.find((u) => u.level === 'BOX')
  const pallet = options.pallets.find((p) => p.code === value.palletTypeCode) ?? null
  let palletResult: ReturnType<typeof calcPallet> = null
  try {
    palletResult =
      box && /^\d+(\.\d+)?$/.test(box.convQty) && Number(box.convQty) > 0
        ? calcPallet(box, pallet, {
            ti: value.palletTi,
            hi: value.palletHi,
            boxQty: value.palletBoxQty,
          })
        : null
  } catch {
    palletResult = null
  }

  const text = (
    key:
      | 'name'
      | 'nameEn'
      | 'shortName'
      | 'spec'
      | 'category1'
      | 'category2'
      | 'category3'
      | 'brandName'
      | 'makerName'
      | 'originCountry'
      | 'hsCode'
      | 'currency',
    label: string,
    span: FieldSpan,
    extra: { required?: boolean; placeholder?: string; newRow?: boolean; hint?: string } = {},
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
        id={id(key)}
        value={value[key] ?? ''}
        placeholder={extra.placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
        disabled={disabled}
        aria-invalid={Boolean(errors[key])}
      />
    </Field>
  )
  const select = <T extends string>(
    key: keyof ItemCreateInput,
    label: string,
    span: FieldSpan,
    choices: readonly { value: T; label: string }[],
    extra: { required?: boolean; none?: string; hint?: string; lock?: boolean } = {},
  ) => (
    <Field
      label={label}
      span={span}
      required={extra.required}
      hint={extra.hint}
      error={errors[key]}
      htmlFor={id(key)}
    >
      <Select
        value={String(value[key] ?? '') || NONE}
        onValueChange={(v) => set({ [key]: v === NONE ? '' : v } as Partial<ItemCreateInput>)}
        disabled={disabled || extra.lock}
      >
        <SelectTrigger id={id(key)} className="w-full" aria-invalid={Boolean(errors[key])}>
          <SelectValue placeholder="선택" />
        </SelectTrigger>
        <SelectContent>
          {extra.none && <SelectItem value={NONE}>{extra.none}</SelectItem>}
          {choices.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
  const days = (
    key:
      | 'shelfLifeDays'
      | 'minInboundShelfDays'
      | 'minOutboundShelfDays'
      | 'expiryAlertDays'
      | 'maxStackBox',
    label: string,
    span: FieldSpan,
    hint?: string,
  ) => (
    <Field label={label} span={span} hint={hint} error={errors[key]} htmlFor={id(key)}>
      <NumberInput
        id={id(key)}
        value={value[key] ?? null}
        onChange={(n) => set({ [key]: n })}
        min={0}
        max={36500}
        disabled={disabled}
      />
    </Field>
  )
  const toggle = (
    key: 'hazmat' | 'fragile' | 'upright' | 'useExpiry' | 'useLot' | 'useSerial' | 'boxOnlyShip',
    label: string,
    span: FieldSpan,
    extra: { lock?: boolean; hint?: string; onLabel?: string; offLabel?: string } = {},
  ) => (
    <Field label={label} span={span} hint={extra.hint} htmlFor={id(key)}>
      <YnToggle
        id={id(key)}
        value={value[key]}
        onChange={(on) => set({ [key]: on })}
        disabled={disabled || extra.lock}
        onLabel={extra.onLabel ?? '예'}
        offLabel={extra.offLabel ?? '아니오'}
      />
    </Field>
  )
  // 세트 구성품 선택지: 세트 품목이고 화주사가 정해지면 불러온다 (화주사가 바뀌면 다시)
  const isSet = value.itemType === 'SET'
  const [componentOptions, setComponentOptions] = useState<{
    shipperId: string
    items: SetComponentOption[]
  } | null>(null)
  useEffect(() => {
    if (!isSet || !value.shipperId || componentOptions?.shipperId === value.shipperId) return
    let cancelled = false
    loadComponentOptions({ shipperId: value.shipperId }).then((result) => {
      if (cancelled) return
      setComponentOptions({ shipperId: value.shipperId, items: result.ok ? result.data : [] })
    })
    return () => {
      cancelled = true
    }
  }, [isSet, value.shipperId, componentOptions?.shipperId, loadComponentOptions])
  const componentItems =
    componentOptions?.shipperId === value.shipperId ? componentOptions.items : []
  const componentById = new Map(componentItems.map((c) => [c.id, c]))
  const componentChoices = componentItems
    // 자기 자신은 고를 수 없다
    .filter((c) => c.id !== item?.id)
    .map((c) => ({
      value: c.id,
      label: `${c.code} · ${c.name}`,
      description: [
        c.spec,
        c.baseUnit,
        c.status !== 'ACTIVE' && (ITEM_STATUS.labels as Record<string, string>)[c.status],
      ]
        .filter(Boolean)
        .join(' · '),
    }))

  const itemUnitChoices = value.units
    .map((u) => unitOf(u.unitId))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({ value: u.id, label: u.code }))

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
            {item || fixedShipperId ? (
              <Input
                id={id('shipperId')}
                value={
                  item?.shipper ?? options.shippers.find((s) => s.id === fixedShipperId)?.name ?? ''
                }
                disabled
                readOnly
              />
            ) : (
              <Select
                value={value.shipperId}
                // 화주사를 바꾸면 그 화주사의 기한·LOT·시리얼 설정을 다시 기본값으로
                onValueChange={(shipperId) => set({ shipperId, ...shipperDefaults(shipperId) })}
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
                  {options.shippers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field
            label="품목코드"
            span={3}
            newRow
            error={errors.code}
            htmlFor={id('code')}
            hint={item ? '바꿀 수 없습니다' : '등록 후 바꿀 수 없습니다'}
          >
            <Input
              id={id('code')}
              value={value.code}
              onChange={(e) => set({ code: e.target.value })}
              disabled={disabled || Boolean(item)}
              maxLength={50}
              placeholder="비워 두면 자동 생성"
              aria-invalid={Boolean(errors.code)}
            />
          </Field>
          <Field
            label="사용자 정의 코드"
            span={3}
            error={errors.custCode}
            htmlFor={id('custCode')}
            hint="화주 시스템의 품목코드 (선택)"
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
          <Field
            label="품목 유형"
            span={3}
            required
            error={errors.itemType}
            htmlFor={id('itemType')}
          >
            <Select
              value={value.itemType}
              // 세트로 바꾸면 세트 방식(기본 가상)·구성품 표를 준비한다 (0098)
              onValueChange={(itemType) =>
                set({
                  itemType: itemType as ItemCreateInput['itemType'],
                  ...(itemType === 'SET' && {
                    setType: value.setType || 'VIRTUAL',
                    components: value.components ?? [],
                  }),
                })
              }
              disabled={disabled}
            >
              <SelectTrigger
                id={id('itemType')}
                className="w-full"
                aria-invalid={Boolean(errors.itemType)}
              >
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TYPE.options.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {isSet &&
            select('setType', '세트 방식', 3, SET_TYPE.options, {
              required: true,
              hint: '실물 세트의 조립 작업은 부가작업에서 (출고는 가상 세트부터)',
            })}
          {text('name', '품목명', 8, { required: true, newRow: true })}
          {text('shortName', '약칭', 4, { hint: '피킹리스트·라벨 표시용' })}
          {text('nameEn', '영문명', 8)}
          {text('spec', '규격', 4, { placeholder: '예: 500g×24입' })}
          {text('category1', '분류 1', 4, { newRow: true })}
          {text('category2', '분류 2', 4)}
          {text('category3', '분류 3', 4)}
          {text('brandName', '브랜드', 4)}
          {text('makerName', '제조사', 4)}
          {text('originCountry', '원산지', 2, { placeholder: 'KR' })}
          {text('hsCode', 'HS 코드', 2)}
          <Field
            label="품목 가액"
            span={4}
            newRow
            error={errors.itemValue}
            htmlFor={id('itemValue')}
            hint="기본단위 1개 기준 (파손·분실 보상)"
          >
            <Input
              id={id('itemValue')}
              inputMode="decimal"
              value={value.itemValue ?? ''}
              onChange={(e) => set({ itemValue: e.target.value })}
              disabled={disabled}
            />
          </Field>
          {text('currency', '통화', 2, { placeholder: 'KRW' })}
          <Field label="비고" span={12} error={errors.remark} htmlFor={id('remark')}>
            <Textarea
              id={id('remark')}
              rows={2}
              value={value.remark ?? ''}
              onChange={(e) => set({ remark: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </FormGrid>
      ),
    },
    ...(isSet
      ? [
          {
            id: 'set',
            title: '세트 구성품',
            description:
              '세트 1개에 들어가는 품목과 수량(구성 품목의 기본단위)입니다. 같은 화주사의 세트가 아닌 품목만 넣을 수 있습니다. 가상 세트는 출고할 때 구성품 재고에서 뺍니다.',
            content: (
              <EditableSubTable<ItemSetComponentInput>
                name="components"
                rows={value.components ?? []}
                onChange={(components) => set({ components })}
                columns={[
                  {
                    key: 'itemId',
                    label: '구성 품목',
                    required: true,
                    render: (cell) => (
                      <SearchSelect
                        id={cell.id}
                        options={componentChoices}
                        value={cell.value}
                        onChange={cell.onChange}
                        disabled={cell.disabled || !value.shipperId}
                        invalid={cell.invalid}
                        placeholder={value.shipperId ? '품목 선택' : '화주사를 먼저 고르세요'}
                        searchPlaceholder="품목코드·품목명 검색"
                        emptyText="고를 수 있는 품목이 없습니다."
                        className="w-full"
                      />
                    ),
                  },
                  {
                    key: 'qty',
                    label: '수량',
                    required: true,
                    width: '12rem',
                    render: (cell) => (
                      <div className="flex items-center gap-2">
                        <Input
                          id={cell.id}
                          inputMode="decimal"
                          value={cell.value}
                          onChange={(e) => cell.onChange(e.target.value)}
                          disabled={cell.disabled}
                          aria-invalid={cell.invalid}
                        />
                        <span className="w-10 shrink-0 text-sm text-muted-foreground">
                          {componentById.get(cell.row.itemId)?.baseUnit ?? ''}
                        </span>
                      </div>
                    ),
                  },
                ]}
                createRow={() => ({ itemId: '', qty: '1' })}
                maxRows={MAX_SET_COMPONENTS}
                errors={errors}
                addLabel="구성품 추가"
                emptyText="구성품이 없습니다. [구성품 추가]로 넣어 주세요."
                disabled={disabled}
              />
            ),
          } satisfies MasterFormSection,
        ]
      : []),
    {
      id: 'units',
      title: '단위·규격',
      description:
        '재고는 기본단위로 저장합니다. BOX·PLT는 기본단위 몇 개인지(환산수량)로 정합니다.',
      content: (
        <div className="space-y-4">
          <FormGrid>
            <Field
              label="기본단위"
              span={4}
              required
              error={errors.baseUnitId}
              htmlFor={id('baseUnitId')}
              hint={
                structureLock
                  ? `${structureLock} 바꿀 수 없습니다`
                  : '재고를 세는 단위 (포장 단위는 안 됨)'
              }
            >
              <Select
                value={value.baseUnitId}
                onValueChange={(baseUnitId) =>
                  set({
                    baseUnitId,
                    // 기본단위 행도 함께 바꾼다
                    units: value.units.map((u) =>
                      u.level === 'BASE' ? { ...u, unitId: baseUnitId } : u,
                    ),
                  })
                }
                disabled={disabled || Boolean(structureLock)}
              >
                <SelectTrigger
                  id={id('baseUnitId')}
                  className="w-full"
                  aria-invalid={Boolean(errors.baseUnitId)}
                >
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {options.units
                    .filter((u) => u.type !== 'PACK' && (u.isActive || u.id === value.baseUnitId))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.code} {u.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            {select('defaultInboundUnitId', '기본 입고단위', 4, itemUnitChoices, {
              none: '자동 (BOX, 없으면 기본단위)',
            })}
            {select('defaultOrderUnitId', '기본 주문단위', 4, itemUnitChoices, {
              none: '자동 (기본단위)',
            })}
          </FormGrid>
          <ItemUnitsSection
            rows={value.units}
            onChange={(units) => set({ units })}
            units={options.units}
            baseUnitCode={baseUnit?.code ?? ''}
            pltCalculated={palletResult}
            errors={errors}
            disabled={disabled}
          />
        </div>
      ),
    },
    {
      id: 'pallet',
      title: '팔레트 적재',
      description: 'BOX를 팔레트에 어떻게 쌓는지로 PLT를 계산합니다.',
      content: (
        <ItemPalletSection
          value={{
            palletTypeCode: value.palletTypeCode ?? '',
            palletTi: value.palletTi,
            palletHi: value.palletHi,
            palletBoxQty: value.palletBoxQty,
          }}
          onChange={(patch) => set(patch)}
          pallets={options.pallets}
          result={palletResult}
          boxReady={Boolean(box && Number(box.convQty) > 0)}
          baseUnitCode={baseUnit?.code ?? ''}
          errors={errors}
          disabled={disabled}
        />
      ),
    },
    {
      id: 'storage',
      title: '보관 조건',
      content: (
        <FormGrid>
          {select('tempZone', '보관 온도대', 3, TEMP_ZONE.options, {
            required: true,
            hint: '같은 온도대 창고에만 적치',
          })}
          <Field
            label="보관 최저온도(℃)"
            span={3}
            error={errors.storageTempMin}
            htmlFor={id('storageTempMin')}
          >
            <Input
              id={id('storageTempMin')}
              inputMode="decimal"
              value={value.storageTempMin ?? ''}
              onChange={(e) => set({ storageTempMin: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field
            label="보관 최고온도(℃)"
            span={3}
            error={errors.storageTempMax}
            htmlFor={id('storageTempMax')}
          >
            <Input
              id={id('storageTempMax')}
              inputMode="decimal"
              value={value.storageTempMax ?? ''}
              onChange={(e) => set({ storageTempMax: e.target.value })}
              disabled={disabled}
            />
          </Field>
          {days('maxStackBox', '최대 적층 박스 단수', 3, '팔레트 단수(HI)보다 작으면 경고')}
          {toggle('hazmat', '위험물', 3, { hint: '위험물 창고에만 적치' })}
          {toggle('fragile', '파손 주의', 3, { hint: '피킹·적재 지시에 표시' })}
          {toggle('upright', '세워서 보관', 3)}
        </FormGrid>
      ),
    },
    {
      id: 'expiry',
      title: '소비기한·LOT',
      description: item
        ? structureLock
          ? `${structureLock} 관리 여부를 바꿀 수 없습니다 (재고 구조가 바뀝니다).`
          : '관리 여부를 바꾸면 이후 입고부터 적용됩니다.'
        : `화주사 기본 설정에서 가져온 값입니다${shipper ? ` (${shipper.name})` : ''}. 저장한 뒤에는 화주 설정이 바뀌어도 이 품목은 그대로입니다.`,
      content: (
        <FormGrid>
          {toggle('useExpiry', '기한 관리', 3, {
            lock: Boolean(structureLock),
            onLabel: '관리',
            offLabel: '안 함',
          })}
          {value.useExpiry && (
            <>
              {select('expiryType', '기한 종류', 3, EXPIRY_TYPE.options, { required: true })}
              {select('expiryInput', '기한 입력 방식', 3, EXPIRY_INPUT.options, { required: true })}
              {days(
                'shelfLifeDays',
                '총 기한 일수',
                3,
                value.expiryInput === 'MFG' || value.expiryInput === 'BOTH'
                  ? `제조일 + ${value.shelfLifeDays ?? 'n'}일 = 기한`
                  : '제조일로부터 기한까지',
              )}
              {days(
                'minInboundShelfDays',
                '입고 최소 잔여일',
                3,
                `비우면 화주사 값${shipper?.minInboundShelfDays != null ? ` (${shipper.minInboundShelfDays}일)` : ''}`,
              )}
              {days(
                'minOutboundShelfDays',
                '출고 최소 잔여일',
                3,
                `비우면 화주사 값${shipper?.minOutboundShelfDays != null ? ` (${shipper.minOutboundShelfDays}일)` : ''}`,
              )}
              {days('expiryAlertDays', '임박 알림 기준일', 3, '잔여일이 이보다 짧으면 "임박"')}
            </>
          )}
          {toggle('useLot', 'LOT 관리', 3, {
            lock: Boolean(structureLock),
            onLabel: '관리',
            offLabel: '안 함',
          })}
          {value.useLot &&
            select('lotSource', 'LOT 생성 방식', 3, LOT_SOURCE.options, { required: true })}
          {toggle('useSerial', '시리얼 관리', 3, {
            lock: Boolean(structureLock),
            hint: '값만 저장 (시리얼 기능은 2차)',
            onLabel: '관리',
            offLabel: '안 함',
          })}
          {select('allocRule', '재고할당 규칙', 3, ALLOC_RULE.options, {
            none: `화주사 값 따름${shipper ? ` (${shipper.allocRule})` : ''}`,
            hint:
              value.useExpiry && value.allocRule !== 'FEFO'
                ? '기한 관리 품목은 FEFO(기한 빠른 순)를 권장합니다'
                : undefined,
          })}
          {select(
            'labelUnit',
            '라벨 단위',
            3,
            LABEL_UNITS.map((u) => ({ value: u, label: u })),
            {
              none: `화주사 값 따름${shipper ? ` (${shipper.labelUnit})` : ''}`,
            },
          )}
        </FormGrid>
      ),
    },
    {
      id: 'shipping',
      title: '출고 조건',
      content: (
        <FormGrid>
          {toggle('boxOnlyShip', '박스 단위 출고만', 4, {
            hint: '주문 수량이 BOX 환산수량의 배수가 아니면 경고·반려 (주문 작업에서)',
          })}
        </FormGrid>
      ),
    },
    {
      id: 'barcodes',
      title: '바코드',
      description:
        'EAN-13·ITF-14 등은 체크디지트를 검사합니다. 같은 화주사의 다른 품목과 겹칠 수 없습니다. 단위별 대표 1개는 라벨에 씁니다.',
      content: (
        <EditableSubTable<ItemBarcodeInput>
          name="barcodes"
          rows={value.barcodes}
          onChange={(barcodes) => set({ barcodes })}
          columns={[
            {
              key: 'unitId',
              label: '단위',
              required: true,
              width: '8rem',
              render: (cell) => (
                <Select value={cell.value} onValueChange={cell.onChange} disabled={cell.disabled}>
                  <SelectTrigger id={cell.id} className="w-full" aria-invalid={cell.invalid}>
                    <SelectValue placeholder="단위" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemUnitChoices.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
            { key: 'barcode', label: '바코드', required: true },
            {
              key: 'barcodeType',
              label: '종류',
              required: true,
              width: '9rem',
              render: (cell) => (
                <Select value={cell.value} onValueChange={cell.onChange} disabled={cell.disabled}>
                  <SelectTrigger id={cell.id} className="w-full" aria-invalid={cell.invalid}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BARCODE_TYPE.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
            {
              key: 'isPrimary',
              label: '대표',
              width: '4rem',
              render: (cell) => (
                <input
                  id={cell.id}
                  type="checkbox"
                  className="mt-2.5 size-4 accent-primary"
                  checked={cell.row.isPrimary}
                  disabled={cell.disabled}
                  // 대표는 단위별 1개: 켜면 같은 단위의 다른 바코드는 끈다
                  onChange={(e) =>
                    set({
                      barcodes: value.barcodes.map((b, i) =>
                        i === cell.index
                          ? { ...b, isPrimary: e.target.checked }
                          : e.target.checked && b.unitId === cell.row.unitId
                            ? { ...b, isPrimary: false }
                            : b,
                      ),
                    })
                  }
                />
              ),
            },
          ]}
          createRow={() => ({
            unitId: value.baseUnitId,
            barcode: '',
            barcodeType: 'EAN13',
            isPrimary: !value.barcodes.some((b) => b.unitId === value.baseUnitId),
          })}
          maxRows={MAX_ITEM_BARCODES}
          errors={errors}
          addLabel="바코드 추가"
          emptyText="등록된 바코드가 없습니다."
          disabled={disabled}
        />
      ),
    },
  ]

  if (item) {
    sections.push({
      id: 'interface',
      title: '연동 정보',
      description: '어디서 등록했는지와 마지막 연동 기록입니다.',
      content: (
        <FormGrid>
          <Field label="등록 경로" span={4} htmlFor={id('source')}>
            <Input id={id('source')} value={item.source} disabled readOnly />
          </Field>
          <Field label="마지막 연동" span={4} htmlFor={id('lastIfAt')}>
            <Input
              id={id('lastIfAt')}
              value={item.lastIfAt ? (formatDate(new Date(item.lastIfAt), true) ?? '-') : '-'}
              disabled
              readOnly
            />
          </Field>
        </FormGrid>
      ),
    })
    const badge = ITEM_STATUS_BADGE[item.status] ?? { label: item.status, tone: 'neutral' as const }
    sections.push({
      id: 'status',
      title: '상태',
      standalone: true,
      description: item.isActive
        ? '사용 중지하면 새 입고·출고에서 고를 수 없습니다. 기록은 남습니다.'
        : '사용 중이 아닌 품목입니다.',
      content: (
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          {canToggleActive && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant={item.isActive ? 'destructive' : 'outline'} size="sm">
                  <PowerIcon />
                  {item.isActive ? '사용 중지' : '다시 사용'}
                </Button>
              }
              title={item.isActive ? '이 품목을 사용 중지할까요?' : '이 품목을 다시 사용할까요?'}
              confirmLabel={item.isActive ? '사용 중지' : '다시 사용'}
              destructive={item.isActive}
              onConfirm={async () => {
                unwrap(await setActiveAction({ ids: [item.id], isActive: !item.isActive }))
                router.refresh()
              }}
            />
          )}
        </div>
      ),
    })
  }

  return (
    <MasterFormPage
      header={{
        ...header,
        meta:
          header.meta ??
          (!item ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <InfoIcon className="size-3.5" />
              품목코드는 등록 후 바꿀 수 없습니다
            </span>
          ) : undefined),
      }}
      form={form}
      readOnly={readOnly}
      sections={[...sections, ...extraSections]}
    />
  )
}
