'use client'

import { TriangleAlertIcon } from 'lucide-react'
import { NumberInput } from '@/components/inputs'
import { Field, FormGrid } from '@/components/master-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PalletResult } from '@/lib/items/item-calc'
import type { ItemPalletOption } from '@/lib/items/item-form-options'

// "선택 안 함" (Select는 빈 글자를 값으로 못 쓴다)
const NONE = '__none__'

// 팔레트 적재 (0083): 종류 + 단당 박스 수(TI) × 단수(HI) → PLT 자동 계산 요약
// TI·HI를 모르면 팔레트당 박스 수만 넣어도 된다 (그 경우 높이는 계산하지 않음)
export function ItemPalletSection({
  value,
  onChange,
  pallets,
  result,
  boxReady,
  baseUnitCode,
  errors,
  disabled,
}: {
  value: {
    palletTypeCode: string
    palletTi: number | null
    palletHi: number | null
    palletBoxQty: number | null
  }
  onChange: (
    patch: Partial<{
      palletTypeCode: string
      palletTi: number | null
      palletHi: number | null
      palletBoxQty: number | null
    }>,
  ) => void
  pallets: ItemPalletOption[]
  result: PalletResult | null
  // BOX 단위(환산수량)가 있는지 — 없으면 계산할 수 없다
  boxReady: boolean
  baseUnitCode: string
  errors: Record<string, string | undefined>
  disabled: boolean
}) {
  const pallet = pallets.find((p) => p.code === value.palletTypeCode)
  const tiHi = Boolean(value.palletTi && value.palletHi)
  const num = (text: string | null) => (text === null ? '-' : String(Number(text)))
  return (
    <FormGrid>
      <Field
        label="팔레트 종류"
        span={4}
        htmlFor="item-palletTypeCode"
        error={errors.palletTypeCode}
      >
        <Select
          value={value.palletTypeCode || NONE}
          onValueChange={(code) => onChange({ palletTypeCode: code === NONE ? '' : code })}
          disabled={disabled}
        >
          <SelectTrigger id="item-palletTypeCode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>선택 안 함 (규격·높이 계산 없음)</SelectItem>
            {pallets
              .filter((p) => p.isActive || p.code === value.palletTypeCode)
              .map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name} ({p.code})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="단당 박스 수 (TI)" span={2} htmlFor="item-palletTi" error={errors.palletTi}>
        <NumberInput
          id="item-palletTi"
          value={value.palletTi}
          onChange={(palletTi) => onChange({ palletTi })}
          min={1}
          max={999}
          disabled={disabled}
        />
      </Field>
      <Field label="단수 (HI)" span={2} htmlFor="item-palletHi" error={errors.palletHi}>
        <NumberInput
          id="item-palletHi"
          value={value.palletHi}
          onChange={(palletHi) => onChange({ palletHi })}
          min={1}
          max={999}
          disabled={disabled}
        />
      </Field>
      <Field
        label="팔레트당 박스 수"
        span={4}
        htmlFor="item-palletBoxQty"
        error={errors.palletBoxQty}
        hint={tiHi ? 'TI × HI로 계산합니다' : 'TI·HI를 모르면 직접 입력'}
      >
        <NumberInput
          id="item-palletBoxQty"
          value={tiHi ? value.palletTi! * value.palletHi! : value.palletBoxQty}
          onChange={(palletBoxQty) => onChange({ palletBoxQty })}
          min={1}
          max={99999}
          disabled={disabled || tiHi}
        />
      </Field>
      <div className="col-span-12 rounded-md border bg-muted/40 p-3 text-sm">
        {!boxReady ? (
          <p className="text-muted-foreground">
            BOX 단위와 환산수량을 먼저 입력하세요. PLT는 BOX 기준으로 계산합니다.
          </p>
        ) : !result ? (
          <p className="text-muted-foreground">
            TI·HI(또는 팔레트당 박스 수)를 넣으면 PLT 수량·높이·중량·CBM을 계산합니다. 넣지 않으면
            단위 표에 PLT 환산수량을 직접 넣을 수 있습니다.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="font-medium">
              1 PLT = {result.boxQty.toLocaleString()} BOX
              {tiHi && ` (${value.palletTi} × ${value.palletHi}단)`} ={' '}
              {Number(result.convQty).toLocaleString()} {baseUnitCode}
            </p>
            <p className="text-muted-foreground">
              {result.heightCm
                ? `높이 ${num(result.heightCm)}cm`
                : '높이 계산 안 됨 (BOX 높이·HI·팔레트 종류 필요)'}
              {pallet?.maxLoadHeightCm && ` (권장 ${num(pallet.maxLoadHeightCm)}cm 이하)`}
              {result.grossWeightKg && ` · 중량 ${num(result.grossWeightKg)}kg`}
              {result.cbm && ` · ${num(result.cbm)} CBM`}
            </p>
            {result.warnings.map((w) => (
              <p key={w.code} className="flex items-center gap-1.5 text-warning">
                <TriangleAlertIcon className="size-3.5" />
                {w.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </FormGrid>
  )
}
