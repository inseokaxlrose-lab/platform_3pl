'use client'

import { PlusIcon, Trash2Icon } from 'lucide-react'
import { StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cbmOf, trimQty } from '@/lib/items/item-calc'
import { UNIT_LEVEL, UNIT_LEVEL_ORDER, type UnitLevel } from '@/lib/items/item-codes'
import type { ItemUnitOption } from '@/lib/items/item-form-options'
import type { ItemUnitInput } from '@/lib/items/item-schema'

// 단위·규격 표 (0083): 레벨별 1행 — BASE(기본단위, 자동·삭제 불가) · INNER · BOX · PLT
// - 환산수량은 "1 BOX = 24 EA"처럼 미리보기
// - PLT는 팔레트 적재 정보가 있으면 계산값(읽기 전용), 없으면 직접 입력
// - CBM은 가로·세로·높이로 자동 (cm)

export const EMPTY_UNIT_ROW = (level: UnitLevel, unitId = ''): ItemUnitInput => ({
  level,
  unitId,
  convQty: level === 'BASE' ? '1' : '',
  widthCm: '',
  depthCm: '',
  heightCm: '',
  grossWeightKg: '',
  netWeightKg: '',
})

// 표 열 (레벨 · 단위 · 환산수량 · 가로·세로·높이·총중량 · CBM · 빼기)
const GRID_COLS = 'md:grid-cols-[7rem_8rem_8rem_repeat(4,minmax(0,1fr))_6rem_2.25rem]'

const SIZE_KEYS = ['widthCm', 'depthCm', 'heightCm', 'grossWeightKg'] as const
const SIZE_LABEL: Record<(typeof SIZE_KEYS)[number], string> = {
  widthCm: '가로',
  depthCm: '세로',
  heightCm: '높이',
  grossWeightKg: '총중량',
}

// 팔레트 적재로 계산한 PLT 값 (있으면 PLT 행은 읽기 전용)
type PltCalculated = {
  convQty: string
  widthCm: string | null
  depthCm: string | null
  heightCm: string | null
  grossWeightKg: string | null
} | null

export function ItemUnitsSection({
  rows,
  onChange,
  units,
  baseUnitCode,
  pltCalculated,
  errors,
  disabled,
}: {
  rows: ItemUnitInput[]
  onChange: (rows: ItemUnitInput[]) => void
  units: ItemUnitOption[]
  baseUnitCode: string
  // 팔레트 적재로 계산한 PLT 값 (있으면 PLT 행은 읽기 전용)
  pltCalculated: PltCalculated
  errors: Record<string, string | undefined>
  disabled: boolean
}) {
  const packUnits = units.filter((u) => u.type === 'PACK')
  const sorted = [...rows].sort(
    (a, b) => UNIT_LEVEL_ORDER[a.level as UnitLevel] - UNIT_LEVEL_ORDER[b.level as UnitLevel],
  )
  const hasPlt = rows.some((r) => r.level === 'PLT')
  const missing = (['INNER', 'BOX', 'PLT'] as UnitLevel[]).filter(
    (l) => !rows.some((r) => r.level === l) && !(l === 'PLT' && pltCalculated),
  )
  const update = (level: string, patch: Partial<ItemUnitInput>) =>
    onChange(rows.map((r) => (r.level === level ? { ...r, ...patch } : r)))
  // 처음 고를 단위: 그 레벨과 같은 코드(BOX·PLT)가 있으면
  const suggest = (level: UnitLevel) =>
    packUnits.find((u) => u.code === level && u.isActive)?.id ?? ''

  // 팔레트 적재로 계산한 PLT: PLT 행이 없으면 보기용 행을 붙인다 (저장하면 서버가 같은 값으로 넣는다)
  const shownRows =
    pltCalculated && !hasPlt ? [...sorted, EMPTY_UNIT_ROW('PLT', suggest('PLT'))] : sorted

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          규격은 cm·kg입니다. 체적은 <b>BOX 규격</b>으로 계산하고, BOX 규격이 없으면 &lsquo;체적
          미등록&rsquo;으로 표시됩니다.
        </p>
        {!disabled &&
          missing.map((level) => (
            <Button
              key={level}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange([...rows, EMPTY_UNIT_ROW(level, suggest(level))])}
            >
              <PlusIcon />
              {level} 추가
            </Button>
          ))}
      </div>
      <div role="table" aria-label="단위·규격" className="space-y-3 md:space-y-0">
        <div
          role="row"
          className={`hidden gap-2 border-b pb-2 text-xs font-medium text-muted-foreground md:grid ${GRID_COLS}`}
        >
          <span role="columnheader">레벨</span>
          <span role="columnheader">단위</span>
          <span role="columnheader">환산수량</span>
          {SIZE_KEYS.map((k) => (
            <span role="columnheader" key={k}>
              {SIZE_LABEL[k]}
            </span>
          ))}
          <span role="columnheader">CBM</span>
          <span role="columnheader" className="sr-only">
            삭제
          </span>
        </div>
        {shownRows.map((row) => {
          const level = row.level as UnitLevel
          const index = rows.indexOf(row)
          const auto = level === 'PLT' && pltCalculated !== null
          const shown = auto ? { ...row, ...calculatedText(pltCalculated) } : row
          const unitCode = units.find((u) => u.id === row.unitId)?.code ?? ''
          const lock = disabled || level === 'BASE'
          const id = (key: string) => `units-${level}-${key}`
          const error = (key: string) => errors[`units.${index}.${key}`]
          return (
            <div
              role="row"
              key={level}
              className={`grid gap-3 rounded-md border p-3 ${GRID_COLS} md:items-start md:gap-2 md:rounded-none md:border-0 md:border-b md:px-0 md:py-2`}
            >
              <div role="cell" className="flex h-9 items-center gap-1 text-sm font-medium">
                {UNIT_LEVEL.labels[level]}
                {auto && <StatusBadge tone="info">계산</StatusBadge>}
              </div>
              <div role="cell">
                {level === 'BASE' ? (
                  <Input
                    id={id('unit')}
                    value={baseUnitCode || '기본단위를 고르세요'}
                    disabled
                    readOnly
                  />
                ) : (
                  <Select
                    value={row.unitId}
                    onValueChange={(unitId) => update(level, { unitId })}
                    disabled={disabled || auto}
                  >
                    <SelectTrigger
                      id={id('unit')}
                      className="w-full"
                      aria-label={`${level} 단위`}
                      aria-invalid={Boolean(error('unitId'))}
                    >
                      <SelectValue placeholder="단위" />
                    </SelectTrigger>
                    <SelectContent>
                      {packUnits
                        .filter((u) => u.isActive || u.id === row.unitId)
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.code} {u.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                {error('unitId') && <p className="text-xs text-destructive">{error('unitId')}</p>}
              </div>
              <div role="cell" className="grid gap-1">
                <Input
                  id={id('convQty')}
                  inputMode="decimal"
                  aria-label={`${level} 환산수량`}
                  value={shown.convQty}
                  onChange={(e) => update(level, { convQty: e.target.value })}
                  disabled={lock || auto}
                  aria-invalid={Boolean(error('convQty'))}
                />
                <span className="text-xs text-muted-foreground">
                  {level === 'BASE'
                    ? '1 = 1'
                    : shown.convQty
                      ? `1 ${unitCode || level} = ${shown.convQty} ${baseUnitCode}`
                      : ''}
                </span>
                {error('convQty') && <p className="text-xs text-destructive">{error('convQty')}</p>}
              </div>
              {SIZE_KEYS.map((key) => (
                <div role="cell" key={key}>
                  <Input
                    id={id(key)}
                    inputMode="decimal"
                    aria-label={`${level} ${SIZE_LABEL[key]}`}
                    placeholder={key === 'grossWeightKg' ? 'kg' : 'cm'}
                    value={shown[key] ?? ''}
                    onChange={(e) => update(level, { [key]: e.target.value })}
                    disabled={disabled || auto}
                    aria-invalid={Boolean(error(key))}
                  />
                  {error(key) && <p className="text-xs text-destructive">{error(key)}</p>}
                </div>
              ))}
              <div role="cell" className="flex h-9 items-center text-sm tabular-nums">
                {trimmed(cbmOf(shown.widthCm, shown.depthCm, shown.heightCm)) || '-'}
              </div>
              <div role="cell" className="flex justify-end">
                {/* 기본단위·계산 PLT는 뺄 수 없다 (PLT를 빼려면 팔레트 적재 정보를 비운다) */}
                {level !== 'BASE' && !auto && !disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${level} 단위 빼기`}
                    onClick={() => onChange(rows.filter((r) => r.level !== level))}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {errors.units && (
        <p role="alert" className="text-sm text-destructive">
          {errors.units}
        </p>
      )}
    </div>
  )
}

// 계산값 표시: 끝의 0은 빼고 ('110.00' → '110'), 없으면 빈 글자
const trimmed = (value: string | null) => (value ? trimQty(value) : '')

// PLT 계산값 → 입력 칸 표시용 글자 (표에 보이는 칸만 골라, null → 빈 글자, 끝의 0 제거)
// (계산 결과에는 박스 수·경고 목록도 있어 칸을 직접 고른다)
function calculatedText(value: NonNullable<PltCalculated>) {
  return {
    convQty: trimmed(value.convQty),
    widthCm: trimmed(value.widthCm),
    depthCm: trimmed(value.depthCm),
    heightCm: trimmed(value.heightCm),
    grossWeightKg: trimmed(value.grossWeightKg),
  }
}
