'use client'

import { XIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SIDO_LIST } from '@/config/korea-regions'
import {
  regionLabel,
  regionsOverlap,
  SIDO_BY_NAME,
  sigungusByName,
  sortRegions,
} from '@/lib/delivery-zones/regions'
import { cn } from '@/lib/utils'

type RegionPickerProps = {
  // 고른 지역 코드 (시·도 2자리 = 전체, 시·군·구 5자리)
  value: string[]
  onChange: (codes: string[]) => void
  // 같은 센터의 다른 권역이 이미 담당하는 지역: 코드 → 권역 이름 (고를 수 없게 흐리게)
  taken: Record<string, string>
  disabled?: boolean
  invalid?: boolean
  id?: string
}

// 배송권역 담당 지역 고르기 (docs/decisions/0033)
// 시·도를 고르면 그 시·군·구 체크 목록. "전체"를 체크하면 그 시·도의 시·군·구는 고를 필요가 없어 잠긴다
export function RegionPicker({ value, onChange, taken, disabled, invalid, id }: RegionPickerProps) {
  const [sido, setSido] = useState(() => value[0]?.slice(0, 2) ?? SIDO_LIST[0].code)
  const sigungus = sigungusByName(sido)
  const wholeChecked = value.includes(sido)
  // 다른 권역이 이 지역(또는 겹치는 지역)을 담당 중이면 그 권역 이름
  const takenBy = (code: string) =>
    Object.entries(taken).find(([takenCode]) => regionsOverlap(code, takenCode))?.[1]

  const toggle = (code: string, checked: boolean) => {
    if (!checked) return onChange(value.filter((c) => c !== code))
    // 시·도 전체를 고르면 그 시·도의 시·군·구는 뺀다 (겹침 방지)
    const rest = code.length === 2 ? value.filter((c) => !c.startsWith(code)) : value
    onChange(sortRegions([...rest, code]))
  }
  // 시·도별로 고른 개수 (시·도 선택 목록에 표시)
  const countIn = (sidoCode: string) => value.filter((c) => c.startsWith(sidoCode)).length

  return (
    <div className="space-y-4">
      {/* 고른 지역 태그 */}
      <div
        id={id}
        aria-invalid={invalid}
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border p-2',
          invalid && 'border-destructive',
        )}
      >
        {value.length === 0 ? (
          <span className="px-1 text-sm text-muted-foreground">아래에서 담당 지역을 고르세요.</span>
        ) : (
          sortRegions(value).map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2.5 text-xs text-secondary-foreground"
            >
              {regionLabel(code)}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`${regionLabel(code)} 빼기`}
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={() => toggle(code, false)}
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </span>
          ))
        )}
        {value.length > 0 && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => onChange([])}
          >
            모두 빼기
          </Button>
        )}
      </div>

      {!disabled && (
        <div className="grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)]">
          <Select value={sido} onValueChange={setSido}>
            <SelectTrigger aria-label="시·도" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIDO_BY_NAME.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                  {countIn(s.code) > 0 && (
                    <span className="text-muted-foreground"> ({countIn(s.code)})</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-2 rounded-md border p-3">
            <RegionCheck
              code={sido}
              label={`${SIDO_LIST.find((s) => s.code === sido)?.name} 전체`}
              checked={wholeChecked}
              takenBy={takenBy(sido)}
              onChange={toggle}
              strong
            />
            {sigungus.length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-2 sm:grid-cols-3 lg:grid-cols-4">
                {sigungus.map((s) => (
                  <RegionCheck
                    key={s.code}
                    code={s.code}
                    label={s.name}
                    // 시·도 전체를 골랐으면 체크된 모양으로 잠근다
                    checked={wholeChecked || value.includes(s.code)}
                    locked={wholeChecked}
                    takenBy={takenBy(s.code)}
                    onChange={toggle}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// 지역 체크 하나: 다른 권역이 쓰는 지역은 잠그고 그 권역 이름을 보여준다
function RegionCheck({
  code,
  label,
  checked,
  locked = false,
  takenBy,
  onChange,
  strong = false,
}: {
  code: string
  label: string
  checked: boolean
  locked?: boolean
  takenBy?: string
  onChange: (code: string, checked: boolean) => void
  strong?: boolean
}) {
  const id = `region-${code}`
  const blocked = Boolean(takenBy) && !checked
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={locked || blocked}
        onCheckedChange={(next) => onChange(code, next === true)}
      />
      <Label
        htmlFor={id}
        className={cn(
          'min-w-0 truncate font-normal',
          strong && 'font-medium',
          blocked && 'text-muted-foreground',
        )}
        title={takenBy ? `${label} — ${takenBy}에서 담당 중` : label}
      >
        {label}
        {blocked && <span className="ml-1 text-xs">({takenBy})</span>}
      </Label>
    </div>
  )
}
