'use client'

import { Trash2Icon } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/common'
import { NumberInput, SearchSelect, YnToggle } from '@/components/inputs'
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
import type { CustomerItemInput } from '@/lib/customer-items/customer-item-schema'
import type { CustomerItemOptions } from '@/lib/customer-items/customer-items'
import {
  createCustomerItemAction,
  deleteCustomerItemsAction,
  getCustomerItemOptionsAction,
  updateCustomerItemAction,
} from './actions'

// 거래처별 품목코드 등록·수정 팝업 (docs/decisions/0098)
// 화주사를 고르면 그 화주사의 거래처(매출처·둘 다)·품목을 불러온다. 납품 단위는 고른 품목의 단위 중에서

export type ShipperChoice = { id: string; code: string; name: string }

export type CustomerItemDialogTarget =
  | { mode: 'create'; shipperId: string; initial: CustomerItemInput }
  | {
      mode: 'edit'
      id: string
      rowVersion: number
      shipperId: string
      initial: CustomerItemInput
    }

// Select는 빈 글자를 값으로 못 쓴다
const AUTO = '__auto__'

export function CustomerItemDialog({
  target,
  shippers,
  onClose,
  onDone,
  canDelete,
}: {
  // null이면 닫힘
  target: CustomerItemDialogTarget | null
  shippers: readonly ShipperChoice[]
  onClose: () => void
  onDone: () => void
  canDelete: boolean
}) {
  const [shipperId, setShipperId] = useState('')
  const [value, setValue] = useState<CustomerItemInput | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 팝업을 열 때마다 대상 값으로 다시 채운다
  const [openedWith, setOpenedWith] = useState<CustomerItemDialogTarget | null>(null)
  if (target && openedWith !== target) {
    setOpenedWith(target)
    setShipperId(target.shipperId)
    setValue(target.initial)
    setErrors({})
    setMessage(null)
  }

  // 화주사의 거래처·품목 (화주사가 바뀌면 다시 불러온다)
  const [options, setOptions] = useState<{ shipperId: string; data: CustomerItemOptions } | null>(
    null,
  )
  useEffect(() => {
    if (!target || !shipperId || options?.shipperId === shipperId) return
    let cancelled = false
    getCustomerItemOptionsAction({ shipperId }).then((result) => {
      if (cancelled) return
      setOptions({ shipperId, data: result.ok ? result.data : { customers: [], items: [] } })
    })
    return () => {
      cancelled = true
    }
  }, [target, shipperId, options?.shipperId])
  const loaded = options?.shipperId === shipperId ? options.data : null

  if (!value) return null
  const set = (patch: Partial<CustomerItemInput>) =>
    setValue((previous) => (previous ? { ...previous, ...patch } : previous))
  const disabled = pending
  const item = loaded?.items.find((i) => i.id === value.itemId)
  const statusNote = (status: string) => (status === 'ACTIVE' ? '' : ' · 사용 중지')
  const id = (key: string) => `customer-item-${key}`

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!target || !value) return
    startTransition(async () => {
      const result =
        target.mode === 'create'
          ? await createCustomerItemAction(value)
          : await updateCustomerItemAction({
              ...value,
              id: target.id,
              rowVersion: target.rowVersion,
            })
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

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {target?.mode === 'edit' ? '거래처 품목코드 수정' : '거래처 품목코드 등록'}
            </DialogTitle>
            <DialogDescription>
              같은 품목도 납품하는 거래처마다 상품코드·바코드가 다릅니다. 납품서·라벨에 이 코드를
              찍습니다.
            </DialogDescription>
          </DialogHeader>

          <FormGrid>
            <Field span={12} label="화주사" required htmlFor={id('shipper')}>
              <Select
                value={shipperId}
                // 화주사를 바꾸면 거래처·품목·납품 단위를 비운다
                onValueChange={(next) => {
                  setShipperId(next)
                  set({ customerId: '', itemId: '', deliveryUnitId: '' })
                }}
                disabled={disabled || target?.mode === 'edit'}
              >
                <SelectTrigger id={id('shipper')} className="w-full">
                  <SelectValue placeholder="화주사 선택" />
                </SelectTrigger>
                <SelectContent>
                  {shippers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              span={6}
              label="거래처"
              required
              error={errors.customerId}
              htmlFor={id('customer')}
              hint="매출처·매출매입 거래처만"
            >
              <SearchSelect
                id={id('customer')}
                options={(loaded?.customers ?? []).map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.code})${statusNote(c.status)}`,
                  keywords: c.code,
                }))}
                value={value.customerId}
                onChange={(customerId) => set({ customerId })}
                disabled={disabled || !shipperId}
                invalid={Boolean(errors.customerId)}
                placeholder={shipperId ? '거래처 선택' : '화주사를 먼저 고르세요'}
                searchPlaceholder="거래처명·코드 검색"
                emptyText="고를 수 있는 거래처가 없습니다."
                className="w-full"
              />
            </Field>
            <Field span={6} label="품목" required error={errors.itemId} htmlFor={id('item')}>
              <SearchSelect
                id={id('item')}
                options={(loaded?.items ?? []).map((i) => ({
                  value: i.id,
                  label: `${i.code} · ${i.name}${statusNote(i.status)}`,
                  description: [i.spec, i.units.map((u) => u.code).join('·')]
                    .filter(Boolean)
                    .join(' · '),
                  keywords: i.code,
                }))}
                value={value.itemId}
                // 품목을 바꾸면 납품 단위를 비운다 (그 품목의 단위 중에서 다시)
                onChange={(itemId) => set({ itemId, deliveryUnitId: '' })}
                disabled={disabled || !shipperId}
                invalid={Boolean(errors.itemId)}
                placeholder={shipperId ? '품목 선택' : '화주사를 먼저 고르세요'}
                searchPlaceholder="품목코드·품목명 검색"
                emptyText="고를 수 있는 품목이 없습니다."
                className="w-full"
              />
            </Field>
            <Field
              span={6}
              label="거래처 품목코드"
              required
              error={errors.custItemCode}
              htmlFor={id('code')}
              hint="거래처 안에서 겹칠 수 없습니다"
            >
              <Input
                id={id('code')}
                value={value.custItemCode}
                onChange={(e) => set({ custItemCode: e.target.value })}
                maxLength={50}
                disabled={disabled}
                aria-invalid={Boolean(errors.custItemCode)}
              />
            </Field>
            <Field
              span={6}
              label="거래처 바코드"
              error={errors.custBarcode}
              htmlFor={id('barcode')}
            >
              <Input
                id={id('barcode')}
                value={value.custBarcode ?? ''}
                onChange={(e) => set({ custBarcode: e.target.value })}
                maxLength={50}
                disabled={disabled}
              />
            </Field>
            <Field span={8} label="거래처 품목명" error={errors.custItemName} htmlFor={id('name')}>
              <Input
                id={id('name')}
                value={value.custItemName ?? ''}
                onChange={(e) => set({ custItemName: e.target.value })}
                maxLength={200}
                disabled={disabled}
              />
            </Field>
            <Field span={4} label="납품 단위" error={errors.deliveryUnitId} htmlFor={id('unit')}>
              <Select
                value={value.deliveryUnitId || AUTO}
                onValueChange={(next) => set({ deliveryUnitId: next === AUTO ? '' : next })}
                disabled={disabled || !item}
              >
                <SelectTrigger id={id('unit')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>품목 기본 주문단위</SelectItem>
                  {(item?.units ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              span={4}
              label="최소 잔여 일수"
              error={errors.minShelfDays}
              htmlFor={id('days')}
              hint="비우면 거래처 값"
            >
              <NumberInput
                id={id('days')}
                value={value.minShelfDays ?? null}
                onChange={(minShelfDays) => set({ minShelfDays })}
                min={0}
                max={9999}
                disabled={disabled}
              />
            </Field>
            <Field
              span={4}
              label="최소 잔여 비율(%)"
              error={errors.minShelfRatio}
              htmlFor={id('ratio')}
              hint="비우면 거래처 값"
            >
              <Input
                id={id('ratio')}
                inputMode="decimal"
                value={value.minShelfRatio ?? ''}
                onChange={(e) => set({ minShelfRatio: e.target.value })}
                disabled={disabled}
                aria-invalid={Boolean(errors.minShelfRatio)}
              />
            </Field>
            <Field span={4} label="사용" htmlFor={id('active')}>
              <YnToggle
                id={id('active')}
                value={value.isActive}
                onChange={(isActive) => set({ isActive })}
                onLabel="사용"
                offLabel="사용 중지"
                disabled={disabled}
              />
            </Field>
            <Field span={12} label="비고" error={errors.remark} htmlFor={id('remark')}>
              <Input
                id={id('remark')}
                value={value.remark ?? ''}
                onChange={(e) => set({ remark: e.target.value })}
                disabled={disabled}
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
                title={`'${value.custItemCode}'를 삭제할까요?`}
                description='상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.'
                confirmLabel="삭제"
                destructive
                onConfirm={async () => {
                  unwrap(await deleteCustomerItemsAction({ ids: [target.id] }))
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
