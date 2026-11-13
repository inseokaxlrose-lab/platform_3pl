'use client'

import { EyeIcon, LayersIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FormColumns, FormField, FormRow, FormSection } from '@/components/common'
import { formatNumber } from '@/components/data-grid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  countLocationRange,
  expandLocationRange,
  locationRangeSchema,
  MAX_BULK_LOCATIONS,
} from '@/lib/locations/location-range'
import { bulkCreateLocationsAction, previewBulkLocationsAction } from '../actions'
import type { WarehouseOption } from '../queries'

type RangeForm = {
  zoneFrom: string
  zoneTo: string
  aisleFrom: string
  aisleTo: string
  aisleDigits: string
  levelFrom: string
  levelTo: string
  levelDigits: string
  separator: '-' | ''
}

const INITIAL: RangeForm = {
  zoneFrom: 'A',
  zoneTo: 'A',
  aisleFrom: '1',
  aisleTo: '10',
  aisleDigits: '2',
  levelFrom: '1',
  levelTo: '5',
  levelDigits: '2',
  separator: '-',
}

type Preview = { total: number; skipped: number; toCreate: number; first: string[]; last: string[] }

// 화면 입력(글자) → 범위 규칙에 넣을 값 (숫자 칸은 숫자로)
const toRange = (f: RangeForm) => ({
  ...f,
  aisleFrom: Number(f.aisleFrom),
  aisleTo: Number(f.aisleTo),
  aisleDigits: Number(f.aisleDigits),
  levelFrom: Number(f.levelFrom),
  levelTo: Number(f.levelTo),
  levelDigits: Number(f.levelDigits),
})

// 로케이션 일괄 생성 (docs/decisions/0028)
// 범위를 바꾸면 미리보기가 사라지고, 지금 입력으로 미리보기를 한 뒤에만 [생성]이 켜진다
export function BulkLocationForm({
  warehouses,
  initialWarehouseId,
}: {
  warehouses: WarehouseOption[]
  initialWarehouseId?: string
}) {
  const router = useRouter()
  const addable = warehouses.filter((w) => w.addable)
  const [warehouseId, setWarehouseId] = useState(
    addable.some((w) => w.id === initialWarehouseId) ? initialWarehouseId! : '',
  )
  const [form, setForm] = useState<RangeForm>(INITIAL)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const set = (patch: Partial<RangeForm>) => {
    setForm((previous) => ({ ...previous, ...patch }))
    setPreview(null)
    setMessage(null)
  }

  // 화면에서 먼저 검사 (같은 규칙), 통과하면 범위 값을 돌려준다
  function validate() {
    const parsed = locationRangeSchema.safeParse(toRange(form))
    const nextErrors: Record<string, string> = {}
    if (!warehouseId) nextErrors.warehouseId = '창고를 골라 주세요.'
    if (!parsed.success) {
      for (const issue of parsed.error.issues) nextErrors[issue.path.join('.')] ??= issue.message
    }
    setErrors(nextErrors)
    return parsed.success && warehouseId ? parsed.data : null
  }

  function runPreview() {
    const range = validate()
    if (!range) return
    startTransition(async () => {
      const result = await previewBulkLocationsAction({ warehouseId, range })
      if (!result.ok) {
        setMessage({ ok: false, text: result.error.message })
        return
      }
      setPreview(result.data)
    })
  }

  function create() {
    const range = validate()
    if (!range || !preview) return
    startTransition(async () => {
      const result = await bulkCreateLocationsAction({ warehouseId, range })
      if (!result.ok) {
        setMessage({ ok: false, text: result.error.message })
        return
      }
      setPreview(null)
      setMessage({
        ok: true,
        text: `${formatNumber(result.data.created)}개를 만들었습니다. (이미 있어 건너뜀 ${formatNumber(result.data.skipped)}개)`,
      })
      router.refresh()
    })
  }

  // 입력 중에도 대략의 개수를 보여준다 (규칙에 맞을 때만)
  const parsed = locationRangeSchema.safeParse(toRange(form))
  const estimate = parsed.success ? countLocationRange(parsed.data) : null
  const sampleCode = parsed.success
    ? expandLocationRange({
        ...parsed.data,
        zoneTo: parsed.data.zoneFrom,
        aisleTo: parsed.data.aisleFrom,
        levelTo: parsed.data.levelFrom,
      })[0]?.code
    : null

  const numberInput = (key: keyof RangeForm, label: string) => (
    <FormField label={label} error={errors[key]} htmlFor={`bulk-${key}`}>
      <Input
        id={`bulk-${key}`}
        value={form[key]}
        onChange={(e) => set({ [key]: e.target.value } as Partial<RangeForm>)}
        inputMode="numeric"
        disabled={pending}
        aria-invalid={Boolean(errors[key])}
      />
    </FormField>
  )

  const left = (
    <>
      <FormSection title="창고">
        <FormField label="창고" required error={errors.warehouseId} htmlFor="bulk-warehouse">
          <Select
            value={warehouseId}
            onValueChange={(id) => {
              setWarehouseId(id)
              setPreview(null)
              setMessage(null)
            }}
            disabled={pending}
          >
            <SelectTrigger id="bulk-warehouse" className="w-full">
              <SelectValue placeholder="창고 선택" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.centerLabel} · {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            입고대기 창고·사용 중지된 창고에는 만들 수 없습니다.
          </p>
        </FormField>
      </FormSection>

      <FormSection
        title="범위"
        description={`구역(영문 한 글자) × 열 × 단. 한 번에 ${formatNumber(MAX_BULK_LOCATIONS)}개까지 만들 수 있습니다.`}
      >
        <FormRow>
          <FormField label="구역 시작" error={errors.zoneFrom} htmlFor="bulk-zoneFrom">
            <Input
              id="bulk-zoneFrom"
              value={form.zoneFrom}
              maxLength={1}
              onChange={(e) => set({ zoneFrom: e.target.value })}
              disabled={pending}
            />
          </FormField>
          <FormField label="구역 끝" error={errors.zoneTo} htmlFor="bulk-zoneTo">
            <Input
              id="bulk-zoneTo"
              value={form.zoneTo}
              maxLength={1}
              onChange={(e) => set({ zoneTo: e.target.value })}
              disabled={pending}
            />
          </FormField>
        </FormRow>
        <FormRow>
          {numberInput('aisleFrom', '열 시작')}
          {numberInput('aisleTo', '열 끝')}
        </FormRow>
        <FormRow>
          {numberInput('levelFrom', '단 시작')}
          {numberInput('levelTo', '단 끝')}
        </FormRow>
        <FormRow>
          {numberInput('aisleDigits', '열 자릿수')}
          {numberInput('levelDigits', '단 자릿수')}
        </FormRow>
        <FormField label="구분자" htmlFor="bulk-separator">
          <Select
            value={form.separator === '' ? 'none' : '-'}
            onValueChange={(v) => set({ separator: v === 'none' ? '' : '-' })}
            disabled={pending}
          >
            <SelectTrigger id="bulk-separator" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-">하이픈 (A-01-02)</SelectItem>
              <SelectItem value="none">없음 (A0102)</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <p className="text-sm text-muted-foreground">
          {estimate === null
            ? '범위를 확인해 주세요.'
            : `예: ${sampleCode} · 최대 ${formatNumber(estimate)}개`}
        </p>
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
        ) : (
          <p className="text-sm text-muted-foreground">[미리보기]를 눌러 만들 코드를 확인하세요.</p>
        )}
      </FormSection>

      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm text-success' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button asChild type="button" variant="outline">
          <Link href={`/admin/master/locations${warehouseId ? `?warehouseId=${warehouseId}` : ''}`}>
            목록으로
          </Link>
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
    </>
  )

  return <FormColumns left={left} />
}
