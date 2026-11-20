'use client'

import { Trash2Icon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/common'
import { DateInput, SearchSelect, type CenterSelectOption } from '@/components/inputs'
import { Field, FormGrid } from '@/components/master-form'
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
import { unwrap } from '@/lib/actions'
import { HOLIDAY_DAY_TYPE } from '@/lib/holidays/holiday-codes'
import type { OperatorHolidayInput } from '@/lib/holidays/holiday-schema'
import { createHolidayAction, deleteHolidaysAction, updateHolidayAction } from './actions'

// 운영사 개별 휴일 등록·수정 팝업 (docs/decisions/0096)
// 센터를 비우면 운영사 전체, 구분은 휴무(쉬는 날) / 특근(쉬는 날이어도 일하는 날)

export type HolidayDialogTarget =
  | { mode: 'create'; initial: OperatorHolidayInput }
  | { mode: 'edit'; id: string; rowVersion: number; initial: OperatorHolidayInput }

export const EMPTY_HOLIDAY: OperatorHolidayInput = {
  centerId: '',
  holidayOn: '',
  name: '',
  dayType: 'CLOSED',
  remark: '',
}

export function HolidayDialog({
  target,
  onClose,
  onDone,
  centers,
  canOperatorWide,
  canDelete,
}: {
  // null이면 닫힘
  target: HolidayDialogTarget | null
  onClose: () => void
  onDone: () => void
  centers: readonly CenterSelectOption[]
  canOperatorWide: boolean
  canDelete: boolean
}) {
  const [value, setValue] = useState<OperatorHolidayInput>(EMPTY_HOLIDAY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 팝업을 열 때마다 대상 값으로 다시 채운다
  const [openedWith, setOpenedWith] = useState<HolidayDialogTarget | null>(null)
  if (target && openedWith !== target) {
    setOpenedWith(target)
    setValue(target.initial)
    setErrors({})
    setMessage(null)
  }

  const set = (patch: Partial<OperatorHolidayInput>) =>
    setValue((previous) => ({ ...previous, ...patch }))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!target) return
    startTransition(async () => {
      const result =
        target.mode === 'create'
          ? await createHolidayAction(value)
          : await updateHolidayAction({ ...value, id: target.id, rowVersion: target.rowVersion })
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
        setMessage(
          Object.keys(fieldErrors).length > 0 ? '입력값을 확인해 주세요.' : result.error.message,
        )
        return
      }
      onClose()
      onDone()
    })
  }

  const id = (key: string) => `holiday-${key}`
  // 센터 직원은 운영사 전체를 고를 수 없다
  const centerOptions = [
    ...(canOperatorWide ? [{ value: '', label: '운영사 전체' }] : []),
    ...centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})`, keywords: c.code })),
  ]

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{target?.mode === 'edit' ? '휴일 수정' : '휴일 등록'}</DialogTitle>
            <DialogDescription>
              특근은 국가 공휴일·쉬는 요일이어도 일하는 날입니다. 센터를 고르면 그 센터에만
              적용되고, 운영사 전체보다 먼저 봅니다.
            </DialogDescription>
          </DialogHeader>

          <FormGrid>
            <Field span={6} label="날짜" required error={errors.holidayOn} htmlFor={id('date')}>
              <DateInput
                id={id('date')}
                value={value.holidayOn}
                onChange={(holidayOn) => set({ holidayOn })}
                disabled={pending}
                aria-invalid={Boolean(errors.holidayOn)}
              />
            </Field>
            <Field span={6} label="구분" required error={errors.dayType} htmlFor={id('dayType')}>
              <Select
                value={value.dayType}
                onValueChange={(dayType) => set({ dayType: dayType as typeof value.dayType })}
                disabled={pending}
              >
                <SelectTrigger id={id('dayType')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOLIDAY_DAY_TYPE.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              span={12}
              label="적용 범위"
              error={errors.centerId}
              htmlFor={id('center')}
              hint={canOperatorWide ? '비우면 운영사의 모든 센터' : '소속 센터만 고를 수 있습니다'}
            >
              <SearchSelect
                id={id('center')}
                options={centerOptions}
                value={value.centerId ?? ''}
                onChange={(centerId) => set({ centerId })}
                disabled={pending}
                placeholder="센터 선택"
                searchPlaceholder="센터명·코드 검색"
                emptyText="찾는 센터가 없습니다."
                className="w-full"
              />
            </Field>
            <Field span={12} label="이름" required error={errors.name} htmlFor={id('name')}>
              <Input
                id={id('name')}
                value={value.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="예: 종무식, 설비 점검, 연말 특근"
                disabled={pending}
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
            <Field span={12} label="비고" error={errors.remark} htmlFor={id('remark')}>
              <Input
                id={id('remark')}
                value={value.remark ?? ''}
                onChange={(e) => set({ remark: e.target.value })}
                disabled={pending}
              />
            </Field>
          </FormGrid>

          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}

          <DialogFooter className="sm:justify-between">
            {target?.mode === 'edit' && canDelete ? (
              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    disabled={pending}
                  >
                    <Trash2Icon />
                    삭제
                  </Button>
                }
                title={`'${value.name}'를 삭제할까요?`}
                description='상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.'
                confirmLabel="삭제"
                destructive
                onConfirm={async () => {
                  unwrap(await deleteHolidaysAction({ ids: [target.id] }))
                  onClose()
                  onDone()
                }}
              />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? '저장 중…' : '저장'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
