'use client'

import { useState, useTransition } from 'react'
import { FormField, FormRow } from '@/components/common'
import { NumberInput, YnToggle } from '@/components/inputs'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EXTERNAL_SYSTEMS, EXTERNAL_SYSTEM_KEYS } from '@/config/external-systems'
import { EMPTY_EXTERNAL_CODES, type ExternalCodes } from '@/lib/master-code/external-codes-schema'
import { UNIT_KIND_LABELS, UNIT_KINDS, type UnitKindValue } from '@/lib/units/unit-labels'
import type { UnitCreateInput } from '@/lib/units/unit-schema'
import { createUnitAction, updateUnitAction } from './actions'

// 수정할 단위 (목록 행)
export type UnitRow = {
  id: string
  code: string
  name: string
  kind: UnitKindValue
  decimals: number
  sortOrder: number
  isActive: boolean
  isSystem: boolean
  externalCodes: ExternalCodes
}

type UnitDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // 없으면 등록
  unit?: UnitRow
  // 새 단위의 정렬 순서 기본값
  nextSortOrder?: number
  readOnly: boolean
  onSaved: () => void
}

const EMPTY: UnitCreateInput = {
  code: '',
  name: '',
  kind: 'BASE',
  decimals: 0,
  sortOrder: 0,
  isActive: true,
  externalCodes: { ...EMPTY_EXTERNAL_CODES },
}

// 단위 등록·수정 팝업 (docs/decisions/0034): 칸이 적어 별도 화면 대신 팝업
// 코드는 등록 때만, 시스템 단위는 종류·사용 여부를 바꿀 수 없다
export function UnitDialog({
  open,
  onOpenChange,
  unit,
  nextSortOrder = 0,
  readOnly,
  onSaved,
}: UnitDialogProps) {
  const initial: UnitCreateInput = unit
    ? { ...unit, externalCodes: { ...EMPTY_EXTERNAL_CODES, ...unit.externalCodes } }
    : { ...EMPTY, sortOrder: nextSortOrder }
  const [value, setValue] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 팝업을 열 때마다 대상 값으로 다시 채운다
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const key = open ? (unit?.id ?? 'new') : null
  if (key !== openedFor) {
    setOpenedFor(key)
    if (key) {
      setValue(initial)
      setErrors({})
      setMessage(null)
    }
  }

  const set = (patch: Partial<UnitCreateInput>) => setValue((v) => ({ ...v, ...patch }))
  const disabled = readOnly || pending
  const locked = unit?.isSystem ?? false

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = unit
        ? await updateUnitAction({ id: unit.id, ...value })
        : await createUnitAction(value)
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
        setMessage(
          Object.keys(fieldErrors).length > 0 ? '입력값을 확인해 주세요.' : result.error.message,
        )
        return
      }
      onOpenChange(false)
      onSaved()
    })
  }

  const id = (name: string) => `unit-${name}`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{unit ? `단위 수정 — ${unit.code}` : '단위 추가'}</DialogTitle>
            <DialogDescription>
              {unit
                ? locked
                  ? '시스템 단위입니다. 이름·정렬 순서·외부 코드만 고칠 수 있습니다.'
                  : '코드는 바꿀 수 없습니다.'
                : '코드는 등록 후 바꿀 수 없습니다 (품목·재고에 이 글자가 저장됩니다).'}
            </DialogDescription>
          </DialogHeader>

          <FormRow>
            <FormField label="코드" required error={errors.code} htmlFor={id('code')}>
              <Input
                id={id('code')}
                value={value.code}
                onChange={(e) => set({ code: e.target.value })}
                disabled={disabled || Boolean(unit)}
                readOnly={Boolean(unit)}
                placeholder="예: EA, KG, BOX"
                className="uppercase"
                aria-invalid={Boolean(errors.code)}
              />
            </FormField>
            <FormField label="이름" required error={errors.name} htmlFor={id('name')}>
              <Input
                id={id('name')}
                value={value.name}
                onChange={(e) => set({ name: e.target.value })}
                disabled={disabled}
                placeholder="예: 개, 킬로그램"
                aria-invalid={Boolean(errors.name)}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="종류" required error={errors.kind} htmlFor={id('kind')}>
              <Select
                value={value.kind}
                onValueChange={(kind) => set({ kind: kind as UnitKindValue })}
                disabled={disabled || locked}
              >
                <SelectTrigger id={id('kind')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {UNIT_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="소수 자리수" error={errors.decimals} htmlFor={id('decimals')}>
              <NumberInput
                id={id('decimals')}
                value={value.kind === 'PACK' ? 0 : value.decimals}
                onChange={(n) => set({ decimals: n ?? 0 })}
                min={0}
                max={6}
                // 환산단위는 입수량을 품목에서 기본단위로 정하므로 소수 자리수가 없다
                disabled={disabled || value.kind === 'PACK'}
                aria-invalid={Boolean(errors.decimals)}
              />
            </FormField>
          </FormRow>
          <p className="-mt-2 text-xs text-muted-foreground">
            기본단위: 재고를 세는 단위 (EA 0자리, KG 3자리처럼 수량 입력의 소수 자리수) · 환산단위:
            기본단위를 묶은 단위 (입수량은 품목에서 정함)
          </p>
          <FormRow>
            {EXTERNAL_SYSTEM_KEYS.map((system) => (
              <FormField
                key={system}
                label={`${EXTERNAL_SYSTEMS[system].label} 코드`}
                error={errors[`externalCodes.${system}`]}
                htmlFor={id(`external-${system}`)}
              >
                <Input
                  id={id(`external-${system}`)}
                  value={value.externalCodes?.[system] ?? ''}
                  onChange={(e) =>
                    set({
                      externalCodes: {
                        ...EMPTY_EXTERNAL_CODES,
                        ...value.externalCodes,
                        [system]: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  placeholder="연동하지 않으면 비워 두세요"
                />
              </FormField>
            ))}
          </FormRow>
          <FormRow>
            <FormField label="정렬 순서" error={errors.sortOrder} htmlFor={id('sortOrder')}>
              <NumberInput
                id={id('sortOrder')}
                value={value.sortOrder}
                onChange={(n) => set({ sortOrder: n ?? 0 })}
                min={0}
                max={9999}
                disabled={disabled}
              />
            </FormField>
            <FormField label="사용" htmlFor={id('isActive')}>
              <YnToggle
                id={id('isActive')}
                value={value.isActive}
                onChange={(isActive) => set({ isActive })}
                disabled={disabled || locked}
              />
            </FormField>
          </FormRow>

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
