'use client'

import { PowerIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { NumberInput } from '@/components/inputs'
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
import type { ActionResult } from '@/lib/actions/result'
import type { ItemFormOptions, ItemUnitOption } from '@/lib/items/item-form-options'
import {
  effectiveItemOptions,
  INHERIT,
  itemCreateSchema,
  MAX_ITEM_UNITS,
  type ItemCreateData,
  type ItemCreateInput,
  type ItemInput,
} from '@/lib/items/item-schema'

// 고르기에서 "선택 안 함"을 나타내는 값 (Radix Select는 빈 글자를 값으로 못 쓴다)
const NONE = '__none__'

// 저장한 값(키 bigint, 빈 칸 null) → 입력값(글자)
function toFormValues(data: ItemCreateData): ItemCreateInput {
  return {
    shipperId: String(data.shipperId),
    code: data.code,
    name: data.name,
    spec: data.spec ?? '',
    barcode: data.barcode ?? '',
    baseUnitId: String(data.baseUnitId),
    useLot: data.useLot,
    useExpiry: data.useExpiry,
    labelUnit: data.labelUnit,
    expiryAlertDays: data.expiryAlertDays === null ? '' : String(data.expiryAlertDays),
    remark: data.remark ?? '',
    units: data.units.map((u) => ({ unitId: String(u.unitId), convQty: u.convQty })),
  }
}

const EMPTY: ItemCreateInput = {
  shipperId: '',
  code: '',
  name: '',
  spec: '',
  barcode: '',
  baseUnitId: '',
  useLot: INHERIT,
  useExpiry: INHERIT,
  labelUnit: INHERIT,
  expiryAlertDays: '',
  remark: '',
  units: [],
}

// 저장 결과 (등록·수정 모두 키와 새 버전을 돌려준다)
type SaveResult = { id: string; rowVersion: number }

// 수정 화면에 넘기는 품목 (조회 함수 결과)
export type ItemFormItem = {
  id: string
  systemCode: string
  rowVersion: number
  isActive: boolean
  shipperId: string
  // '가나식품 (GANA)'
  shipper: string
  input: ItemInput
}

type ItemFormProps = {
  header: MasterFormHeader
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
}

// 품목 등록·수정 (docs/decisions/0041, 입력 화면 틀 0031) — 운영사 화면과 화주 포털이 같이 쓴다
// 관리 옵션(로트·유통기한·라벨 단위)은 "화주사 기본값 따름"이 기본이고, 지금 실제로 적용되는 값을 함께 보여준다
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
}: ItemFormProps) {
  const router = useRouter()
  const form = useMasterForm({
    initial: item
      ? { ...item.input, shipperId: item.shipperId }
      : { ...EMPTY, shipperId: fixedShipperId ?? '' },
    version: item?.rowVersion,
    schema: itemCreateSchema,
    save: (value: ItemCreateInput, version) =>
      item
        ? updateAction({ ...value, id: item.id, rowVersion: version ?? item.rowVersion })
        : createAction(value),
    afterSave: toFormValues,
    createdHref: item ? undefined : (created) => `${basePath}/${(created as { id: string }).id}`,
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `item-${key}`
  const props = (key: string) => ({ id: id(key), disabled, 'aria-invalid': Boolean(errors[key]) })

  const unitById = new Map(options.units.map((u) => [u.id, u]))
  // 고를 수 있는 단위: 사용 중인 것 + 지금 저장된 값 (사용 중지돼도 그대로 둘 수 있다)
  // role BASE: 기본단위(포장 아닌 단위) / PACK: 환산단위(포장 단위) — 0078
  const choosable = (role: 'BASE' | 'PACK', current: string) =>
    options.units.filter(
      (u) =>
        (role === 'PACK' ? u.type === 'PACK' : u.type !== 'PACK') &&
        (u.isActive || u.id === current),
    )
  const baseUnit = unitById.get(value.baseUnitId)
  const shipper = options.shippers.find((s) => s.id === value.shipperId)
  // 지금 실제로 적용되는 관리 옵션 (화주사를 고르기 전에는 모른다)
  const effective = shipper ? effectiveItemOptions(value, shipper) : null
  const labelUnitMissing =
    effective !== null &&
    !value.units.some((u) => unitById.get(u.unitId)?.code === effective.labelUnit)

  const text = (
    key: 'code' | 'name' | 'spec' | 'barcode',
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

  // 고르기 (값 목록이 고정된 칸)
  const select = (
    key: string,
    current: string,
    choices: { value: string; label: string }[],
    onChange: (next: string) => void,
    locked = false,
  ) => (
    <Select
      // 비어 있을 때: "화주사 기본값"처럼 빈 값 선택지가 있으면 그것, 없으면 안내 글자("선택")가 보이게
      value={current !== '' ? current : choices.some((c) => c.value === '') ? NONE : ''}
      onValueChange={(next) => onChange(next === NONE ? '' : next)}
      disabled={disabled || locked}
    >
      <SelectTrigger id={id(key)} className="w-full" aria-invalid={Boolean(errors[key])}>
        <SelectValue placeholder="선택" />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value || NONE} value={choice.value || NONE}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  // 관리 옵션 고르기: 화주사 기본값(지금 값) / 사용 / 안 함
  const yn = (key: 'useLot' | 'useExpiry', label: string) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)}>
      {select(
        key,
        value[key],
        [
          {
            value: INHERIT,
            label: `화주사 기본값${shipper ? ` (${shipper[key] ? '사용' : '안 함'})` : ''}`,
          },
          { value: 'Y', label: '사용' },
          { value: 'N', label: '안 함' },
        ],
        (next) => set({ [key]: next as ItemInput['useLot'] }),
      )}
    </Field>
  )

  const unitLabel = (u: ItemUnitOption) =>
    `${u.code} · ${u.name}${u.isActive ? '' : ' (사용 중지)'}`

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
            {item ? (
              // 화주사는 등록 후 바꿀 수 없다 (재고·이력이 화주사에 묶인다)
              <Input id={id('shipperId')} value={item.shipper} disabled readOnly />
            ) : (
              select(
                'shipperId',
                value.shipperId,
                options.shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
                (shipperId) => set({ shipperId }),
                Boolean(fixedShipperId),
              )
            )}
          </Field>
          {text('code', '품목코드', 3, { placeholder: '비우면 시스템 코드', newRow: true })}
          <Field
            label="시스템 코드"
            span={3}
            htmlFor={id('system-code')}
            hint="라벨·이력에 쓰는 바뀌지 않는 코드"
          >
            <Input
              id={id('system-code')}
              value={item?.systemCode ?? '저장하면 자동으로 부여됩니다'}
              disabled
              readOnly
            />
          </Field>
          {text('name', '품목명', 8, { required: true, newRow: true })}
          {text('spec', '규격', 4, { placeholder: '예: 500ml × 20' })}
          {text('barcode', '바코드', 4, { placeholder: '선택' })}
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
      id: 'units',
      title: '단위',
      description:
        '재고는 항상 기본단위로 저장합니다. 환산단위의 입수량은 기본단위 기준입니다 (예: BOX = 24 EA).',
      content: (
        <div className="grid gap-4">
          <FormGrid>
            <Field
              label="기본단위"
              span={4}
              required
              error={errors.baseUnitId}
              htmlFor={id('baseUnitId')}
            >
              {select(
                'baseUnitId',
                value.baseUnitId,
                choosable('BASE', value.baseUnitId).map((u) => ({
                  value: u.id,
                  label: unitLabel(u),
                })),
                (baseUnitId) => set({ baseUnitId }),
              )}
            </Field>
          </FormGrid>
          <EditableSubTable
            name="units"
            rows={value.units}
            onChange={(units) => set({ units })}
            columns={[
              {
                key: 'unitId',
                label: '환산단위',
                required: true,
                width: '12rem',
                render: (cell) =>
                  select(
                    cell.id,
                    cell.value,
                    choosable('PACK', cell.value).map((u) => ({
                      value: u.id,
                      label: unitLabel(u),
                    })),
                    cell.onChange,
                  ),
              },
              {
                key: 'convQty',
                label: `입수량${baseUnit ? ` (${baseUnit.code})` : ''}`,
                required: true,
                render: (cell) => (
                  <NumberInput
                    id={cell.id}
                    disabled={cell.disabled}
                    aria-invalid={cell.invalid}
                    // 소수 자리는 기본단위를 따른다 (EA면 정수, KG면 3자리)
                    decimals={baseUnit?.decimals ?? 0}
                    min={0}
                    unit={baseUnit?.code}
                    value={cell.value === '' ? null : Number(cell.value)}
                    onChange={(next) => cell.onChange(next === null ? '' : String(next))}
                  />
                ),
              },
            ]}
            createRow={() => ({ unitId: '', convQty: '' })}
            maxRows={MAX_ITEM_UNITS}
            errors={errors}
            addLabel="환산단위 추가"
            countUnit="개"
            emptyText="환산단위가 없습니다. 묶음으로 입고·출고하면 BOX·PLT 등을 넣어 주세요."
            disabled={disabled}
          />
          {labelUnitMissing && (
            <p className="text-sm text-warning" role="note">
              라벨 단위 {effective!.labelUnit}의 입수량이 없습니다. 저장은 되지만, 라벨을 발행하려면{' '}
              {effective!.labelUnit} 환산단위를 넣어야 합니다.
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'options',
      title: '관리 옵션',
      description:
        '"화주사 기본값"을 고르면 화주사의 설정을 따르고, 화주사 설정을 바꾸면 함께 바뀝니다.',
      content: (
        <div className="grid gap-3">
          <FormGrid>
            {yn('useLot', '로트번호')}
            {yn('useExpiry', '유통기한')}
            <Field label="라벨 단위" span={4} error={errors.labelUnit} htmlFor={id('labelUnit')}>
              {select(
                'labelUnit',
                value.labelUnit,
                [
                  {
                    value: INHERIT,
                    label: `화주사 기본값${shipper ? ` (${shipper.labelUnit})` : ''}`,
                  },
                  { value: 'PLT', label: 'PLT' },
                  { value: 'BOX', label: 'BOX' },
                ],
                (labelUnit) => set({ labelUnit: labelUnit as ItemInput['labelUnit'] }),
              )}
            </Field>
            {/* 임박 기준 일수: 유통기한을 실제로 쓸 때만 */}
            {effective?.useExpiry && (
              <Field
                label="유통기한 임박 기준"
                span={4}
                error={errors.expiryAlertDays}
                htmlFor={id('expiryAlertDays')}
                hint="유통기한까지 이 일수 이하로 남으면 '임박'으로 표시합니다"
              >
                <NumberInput
                  {...props('expiryAlertDays')}
                  min={1}
                  max={3650}
                  unit="일"
                  value={value.expiryAlertDays === '' ? null : Number(value.expiryAlertDays)}
                  onChange={(next) => set({ expiryAlertDays: next === null ? '' : String(next) })}
                />
              </Field>
            )}
          </FormGrid>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {effective
              ? `지금 적용: 로트 ${effective.useLot ? '사용' : '안 함'} · 유통기한 ${effective.useExpiry ? '사용' : '안 함'} · 라벨 ${effective.labelUnit}`
              : '화주사를 고르면 지금 적용되는 값이 보입니다.'}
          </p>
        </div>
      ),
    },
  ]

  // 수정 화면에서만: 상태 (바로 처리)
  if (item) {
    sections.push({
      id: 'status',
      title: '상태',
      standalone: true,
      description: item.isActive
        ? '사용 중지하면 새 입고예정(ASN)에서 고를 수 없습니다. 기록은 남습니다.'
        : '사용 중지된 품목입니다.',
      content: (
        <div className="flex flex-wrap items-center gap-3">
          {item.isActive ? (
            <StatusBadge tone="success">사용</StatusBadge>
          ) : (
            <StatusBadge tone="danger">사용 중지</StatusBadge>
          )}
          {canToggleActive && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant={item.isActive ? 'destructive' : 'outline'} size="sm">
                  <PowerIcon />
                  {item.isActive ? '사용 중지' : '다시 사용'}
                </Button>
              }
              title={item.isActive ? '이 품목을 사용 중지할까요?' : '이 품목을 다시 사용할까요?'}
              description={
                item.isActive
                  ? '새 입고예정에서 고를 수 없게 됩니다. 이미 있는 재고·기록은 그대로입니다.'
                  : '다시 고를 수 있게 됩니다.'
              }
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

  return <MasterFormPage header={header} form={form} readOnly={readOnly} sections={sections} />
}
