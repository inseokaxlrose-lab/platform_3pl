'use client'

import { EyeIcon, LayersIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { LOCATION_BULK_MAX } from '@/config/locations'
import { FormSection } from '@/components/common'
import { formatNumber } from '@/components/data-grid'
import {
  CenterSelect,
  CodeSelect,
  InheritableField,
  NumberInput,
  WarehouseSelect,
  YnToggle,
  ZoneSelect,
} from '@/components/inputs'
import { Field, FormGrid } from '@/components/master-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  countLocationPattern,
  defaultPattern,
  expandLocationPattern,
  locationPatternSchema,
} from '@/lib/locations/location-pattern'
import {
  DEFAULT_BULK_ATTRIBUTES,
  locationBulkSchema,
  type LocationBulkInput,
} from '@/lib/locations/location-schema'
import { lengthToCm, weightToKg } from '@/lib/units/dimension'
import { bulkCreateLocationsAction, previewBulkLocationsAction } from '../actions'
import type { LocationOptions } from '../queries'

// 범위 칸 (화면은 글자, 검사 전에 숫자로)
type RangeText = { from: string; to: string; digits: string }
type Attributes = LocationBulkInput['attributes']

const INITIAL_ROW: RangeText = { from: '1', to: '10', digits: '2' }
const INITIAL_LEVEL: RangeText = { from: '1', to: '5', digits: '2' }
const INITIAL_BAY: RangeText = { from: '1', to: '3', digits: '2' }

const toRange = (r: RangeText) => ({
  from: Number(r.from),
  to: Number(r.to),
  digits: Number(r.digits),
})

type Preview = { total: number; skipped: number; toCreate: number; first: string[]; last: string[] }
type Result = { created: number; skipped: number; warehouseId: string; zoneId: string }

// 로케이션 일괄 생성 (docs/decisions/0028, 0075)
// 센터 → 창고 → 구역을 고르고, 열·(연)·단 범위와 코드 패턴({ZONE}-{ROW}-{LEVEL})으로 코드를 만든다
// 입력을 바꾸면 미리보기가 사라지고, 지금 입력으로 미리보기를 한 뒤에만 [생성]이 켜진다
export function BulkLocationForm({
  options,
  initialWarehouseId,
  initialZoneId,
}: {
  options: LocationOptions
  initialWarehouseId?: string
  initialZoneId?: string
}) {
  const router = useRouter()
  const { zones, units } = options
  const addable = options.warehouses.filter((w) => w.addable)
  const initial = addable.find((w) => w.id === initialWarehouseId)
  const centers = [
    ...new Map(
      addable.map((w) => [w.centerId, { id: w.centerId, code: w.centerCode, name: w.centerName }]),
    ).values(),
  ]

  const [centerId, setCenterId] = useState(initial?.centerId ?? '')
  const [warehouseId, setWarehouseId] = useState(initial?.id ?? '')
  const [zoneId, setZoneId] = useState(
    zones.some((z) => z.id === initialZoneId && z.warehouseId === initial?.id)
      ? initialZoneId!
      : '',
  )
  const [pattern, setPattern] = useState(defaultPattern(initial?.separator))
  const [row, setRow] = useState(INITIAL_ROW)
  const [level, setLevel] = useState(INITIAL_LEVEL)
  const [bay, setBay] = useState<RangeText | null>(null)
  // 용량은 화면 단위 글자 (보낼 때 cm·kg)
  const [attributes, setAttributes] = useState<Attributes>(DEFAULT_BULK_ATTRIBUTES)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const warehouse = addable.find((w) => w.id === warehouseId)
  const zoneCode = zones.find((z) => z.id === zoneId)?.code ?? ''

  // 입력이 바뀌면 미리보기·결과를 지운다
  const touched = () => {
    setPreview(null)
    setResult(null)
    setMessage(null)
  }

  const patternValue = {
    zoneCode: zoneCode || 'A',
    pattern,
    row: toRange(row),
    level: toRange(level),
    bay: bay && toRange(bay),
    cell: null,
  }
  const input = (): LocationBulkInput => ({
    warehouseId,
    zoneId,
    pattern: patternValue,
    attributes: {
      ...attributes,
      widthCm: lengthToCm(attributes.widthCm, units.length),
      depthCm: lengthToCm(attributes.depthCm, units.length),
      heightCm: lengthToCm(attributes.heightCm, units.length),
      maxWeightKg: weightToKg(attributes.maxWeightKg, units.weight),
    },
  })

  // 화면에서 먼저 검사 (서버와 같은 규칙)
  function validate() {
    const parsed = locationBulkSchema.safeParse(input())
    if (parsed.success) {
      setErrors({})
      return input()
    }
    const next: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      // pattern.row.to → row.to (화면 칸 이름)
      const key = issue.path.filter((p) => p !== 'pattern' && p !== 'attributes').join('.')
      next[key || 'pattern'] ??= issue.message
    }
    setErrors(next)
    return null
  }

  function runPreview() {
    const data = validate()
    if (!data) return
    startTransition(async () => {
      const response = await previewBulkLocationsAction(data)
      if (!response.ok) {
        setMessage(response.error.message)
        return
      }
      setPreview(response.data)
    })
  }

  function create() {
    const data = validate()
    if (!data || !preview) return
    startTransition(async () => {
      const response = await bulkCreateLocationsAction(data)
      if (!response.ok) {
        setMessage(response.error.message)
        return
      }
      setPreview(null)
      setResult({ ...response.data, warehouseId, zoneId })
      router.refresh()
    })
  }

  // 입력 중에도 대략의 개수·예시 코드 (규칙에 맞을 때만)
  const parsedPattern = locationPatternSchema.safeParse(patternValue)
  const estimate = parsedPattern.success ? countLocationPattern(parsedPattern.data) : null
  const sampleCode = parsedPattern.success
    ? expandLocationPattern({
        ...parsedPattern.data,
        row: { ...parsedPattern.data.row, to: parsedPattern.data.row.from },
        level: { ...parsedPattern.data.level, to: parsedPattern.data.level.from },
        bay: parsedPattern.data.bay && {
          ...parsedPattern.data.bay,
          to: parsedPattern.data.bay.from,
        },
      })[0]?.code
    : null

  // 범위 한 줄 (시작·끝·자릿수)
  const rangeRow = (
    key: 'row' | 'level' | 'bay',
    label: string,
    value: RangeText,
    onChange: (next: RangeText) => void,
  ) => (
    <FormGrid>
      {(['from', 'to', 'digits'] as const).map((part) => (
        <Field
          key={part}
          span={4}
          label={`${label} ${{ from: '시작', to: '끝', digits: '자릿수' }[part]}`}
          error={errors[`${key}.${part}`]}
          htmlFor={`bulk-${key}-${part}`}
        >
          <Input
            id={`bulk-${key}-${part}`}
            value={value[part]}
            onChange={(e) => {
              onChange({ ...value, [part]: e.target.value.replace(/\D/g, '') })
              touched()
            }}
            inputMode="numeric"
            disabled={pending}
            aria-invalid={Boolean(errors[`${key}.${part}`])}
          />
        </Field>
      ))}
    </FormGrid>
  )
  const setAttr = (patch: Partial<Attributes>) => {
    setAttributes((prev) => ({ ...prev, ...patch }))
    touched()
  }
  const decimal = (
    key: 'widthCm' | 'depthCm' | 'heightCm' | 'maxWeightKg',
    label: string,
    unit: string,
  ) => (
    <Field span={3} label={label} htmlFor={`bulk-${key}`} error={errors[key]}>
      <NumberInput
        id={`bulk-${key}`}
        value={attributes[key] === '' ? null : Number(attributes[key])}
        onChange={(n) => setAttr({ [key]: n === null ? '' : String(n) })}
        decimals={2}
        min={0}
        unit={unit}
        disabled={pending}
      />
    </Field>
  )
  const inherit = (key: 'inbound' | 'outbound' | 'allocatable', label: string) => (
    <Field span={4} label={label} htmlFor={`bulk-${key}`}>
      <InheritableField
        id={`bulk-${key}`}
        parentLabel="창고"
        parentValue={warehouse ? (warehouse.ops[key] ? '가능' : '불가') : ''}
        inherited={attributes[key] === null}
        onInheritedChange={(inherited) =>
          setAttr({ [key]: inherited ? null : (warehouse?.ops[key] ?? true) })
        }
        disabled={pending}
      >
        <YnToggle
          id={`bulk-${key}`}
          value={attributes[key] ?? false}
          onChange={(v) => setAttr({ [key]: v })}
          onLabel="가능"
          offLabel="불가"
          disabled={pending}
        />
      </InheritableField>
    </Field>
  )
  const mix = (key: 'mixItem' | 'mixLot' | 'mixShipper', label: string) => (
    <Field span={4} label={label} htmlFor={`bulk-${key}`}>
      <YnToggle
        id={`bulk-${key}`}
        value={attributes[key]}
        onChange={(v) => setAttr({ [key]: v })}
        disabled={pending}
      />
    </Field>
  )

  const listHref = (w: string, z: string) =>
    `/admin/master/locations?${new URLSearchParams({
      ...(w && { warehouse: w, center: addable.find((x) => x.id === w)?.centerId ?? '' }),
      ...(z && { zone: z }),
    }).toString()}`

  // 도구 화면: 좁은 폭 한 단 (기준정보 입력 틀은 쓰지 않음 — 저장이 아니라 미리보기→생성)
  return (
    <div className="max-w-3xl space-y-6">
      <FormSection
        title="대상"
        description="시스템 기본 창고(입고·출고·반품 대기)·사용 중지된 창고에는 만들 수 없습니다."
      >
        <FormGrid>
          <Field span={4} label="센터" required htmlFor="bulk-center">
            <CenterSelect
              id="bulk-center"
              options={centers}
              value={centerId}
              onChange={(id) => {
                setCenterId(id)
                setWarehouseId('')
                setZoneId('')
                touched()
              }}
              disabled={pending}
            />
          </Field>
          <Field span={4} label="창고" required error={errors.warehouseId} htmlFor="bulk-warehouse">
            <WarehouseSelect
              id="bulk-warehouse"
              options={addable}
              centerId={centerId}
              value={warehouseId}
              onChange={(id) => {
                setWarehouseId(id)
                setZoneId('')
                // 창고의 코드 구분자로 기본 패턴
                setPattern(defaultPattern(addable.find((w) => w.id === id)?.separator))
                touched()
              }}
              disabled={pending}
              invalid={Boolean(errors.warehouseId)}
            />
          </Field>
          <Field span={4} label="구역" required error={errors.zoneId} htmlFor="bulk-zone">
            <ZoneSelect
              id="bulk-zone"
              options={zones}
              warehouseId={warehouseId}
              value={zoneId}
              onChange={(id) => {
                setZoneId(id)
                touched()
              }}
              disabled={pending}
              invalid={Boolean(errors.zoneId)}
            />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection
        title="범위 · 코드 패턴"
        description={`한 번에 ${formatNumber(LOCATION_BULK_MAX)}개까지 만들 수 있습니다.`}
      >
        {rangeRow('row', '열', row, setRow)}
        <div className="flex items-center gap-2">
          <Checkbox
            id="bulk-use-bay"
            checked={bay !== null}
            onCheckedChange={(checked) => {
              setBay(checked === true ? INITIAL_BAY : null)
              // 연을 켜면 패턴에 {BAY}를 넣어 준다 (열 뒤)
              if (checked === true && !pattern.includes('{BAY}')) {
                setPattern(pattern.replace('{ROW}', `{ROW}${warehouse?.separator ?? '-'}{BAY}`))
              }
              if (checked !== true) setPattern(pattern.replace(/[-]?\{BAY\}/, ''))
              touched()
            }}
            disabled={pending}
          />
          <Label htmlFor="bulk-use-bay" className="text-sm font-normal">
            연 사용 (랙의 가로 칸)
          </Label>
        </div>
        {bay && rangeRow('bay', '연', bay, setBay)}
        {rangeRow('level', '단', level, setLevel)}
        <FormGrid>
          <Field
            span={8}
            label="코드 패턴"
            required
            error={errors.pattern}
            htmlFor="bulk-pattern"
            hint="{ZONE} 구역 · {ROW} 열 · {BAY} 연 · {LEVEL} 단 (구분자는 하이픈만)"
          >
            <Input
              id="bulk-pattern"
              value={pattern}
              onChange={(e) => {
                setPattern(e.target.value.toUpperCase())
                touched()
              }}
              disabled={pending}
              aria-invalid={Boolean(errors.pattern)}
            />
          </Field>
        </FormGrid>
        <p className="text-sm text-muted-foreground">
          {estimate === null
            ? '범위·패턴을 확인해 주세요.'
            : `예: ${sampleCode} · 최대 ${formatNumber(estimate)}개${zoneCode ? '' : ' (구역을 고르면 {ZONE}이 그 코드로 바뀝니다)'}`}
        </p>
      </FormSection>

      <FormSection
        title="공통 속성"
        description="만들 로케이션에 모두 같은 값을 넣습니다. 나중에 한 칸씩 고칠 수 있습니다."
      >
        <FormGrid>
          <Field
            span={4}
            label="로케이션 유형"
            required
            htmlFor="bulk-locType"
            error={errors.locType}
          >
            <CodeSelect
              id="bulk-locType"
              group="LOC_TYPE"
              value={attributes.locType}
              onChange={(locType) => setAttr({ locType })}
              disabled={pending}
            />
          </Field>
          <Field span={4} label="최대 팔레트 수" htmlFor="bulk-maxPalletCnt">
            <NumberInput
              id="bulk-maxPalletCnt"
              value={attributes.maxPalletCnt}
              onChange={(n) => setAttr({ maxPalletCnt: n })}
              min={0}
              disabled={pending}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          {decimal('widthCm', '가로', units.length.label)}
          {decimal('depthCm', '세로', units.length.label)}
          {decimal('heightCm', '높이', units.length.label)}
          {decimal('maxWeightKg', '최대 중량', units.weight.label)}
        </FormGrid>
        <FormGrid>
          {inherit('inbound', '적치 가능')}
          {inherit('outbound', '피킹 가능')}
          {inherit('allocatable', '출고 할당 가능')}
          {mix('mixItem', '다품목 혼적')}
          {mix('mixLot', '다로트 혼적')}
          {mix('mixShipper', '다화주 혼적')}
        </FormGrid>
      </FormSection>

      <FormSection title="미리보기">
        {preview ? (
          <div className="space-y-2 text-sm" role="status" aria-label="미리보기 결과">
            <p>
              <b className="text-foreground">{formatNumber(preview.toCreate)}개</b>를 만듭니다.
              {preview.skipped > 0 && ` (이미 있는 ${formatNumber(preview.skipped)}개는 건너뜀)`}
            </p>
            {preview.toCreate > 0 && (
              <p className="font-mono text-xs text-muted-foreground">
                {preview.first.join(', ')}
                {preview.last.length > 0 && ` … ${preview.last.join(', ')}`}
              </p>
            )}
          </div>
        ) : result ? (
          <div className="space-y-2 text-sm" role="status" aria-label="생성 결과">
            <p className="text-success">
              생성 {formatNumber(result.created)}개 · 건너뜀 {formatNumber(result.skipped)}개
            </p>
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={listHref(result.warehouseId, result.zoneId)}>생성된 로케이션 보기</Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">[미리보기]를 눌러 만들 코드를 확인하세요.</p>
        )}
      </FormSection>

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button asChild type="button" variant="outline">
          <Link href={listHref(warehouseId, '')}>목록으로</Link>
        </Button>
        <Button type="button" variant="outline" onClick={runPreview} disabled={pending}>
          <EyeIcon />
          미리보기
        </Button>
        <Button
          type="button"
          onClick={create}
          disabled={pending || !preview || preview.toCreate === 0}
        >
          <LayersIcon />
          {pending ? '처리 중…' : '생성'}
        </Button>
      </div>
    </div>
  )
}
