'use client'

import { Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { StatusBadge } from '@/components/common'
import { AddressInput, PhoneInput, YnToggle } from '@/components/inputs'
import { Field, FormGrid } from '@/components/master-form'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { SHIP_TO_STATUS } from '@/lib/customers/customer-codes'
import { shipToSchema, type ShipToInput } from '@/lib/customers/customer-schema'
import { previewShipToCenterAction } from './actions'

// "권역 자동" (Select는 빈 값을 쓸 수 없어 따로 둔다)
const AUTO = '__auto__'

type Center = { id: string; code: string; name: string }

// 납품처 편집 드로어 (0082): 주소·수령 정보·배송센터. [적용]하면 화면의 납품처 표에 반영되고, 거래처 [저장] 때 함께 저장된다
// - 기본 납품처 + 거래처 주소 동기화: 주소 칸 대신 거래처 주소를 쓴다 (동기화를 끄면 직접 입력)
// - 배송센터: "권역 자동"이면 저장할 때 주소로 정한다. 직접 고르면 지역 기본 센터와 다를 때 경고
export function ShipToSheet({
  open,
  row,
  isNew,
  shipperId,
  centers,
  customerAddress,
  removeBlocked,
  existingCodes,
  disabled,
  onApply,
  onRemove,
  onClose,
}: {
  open: boolean
  row: ShipToInput
  isNew: boolean
  shipperId: string
  centers: Center[]
  // 동기화할 거래처 주소 (표시용)
  customerAddress: string
  // 지울 수 없는 이유 (기본·마지막 납품처) — 없으면 지울 수 있다
  removeBlocked: string | null
  // 다른 납품처의 코드 (겹침 검사)
  existingCodes: string[]
  disabled: boolean
  onApply: (row: ShipToInput) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ShipToInput>(row)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [regionDefault, setRegionDefault] = useState<{
    centerId: string
    centerName: string
  } | null>(null)
  // 값을 고치면 그 칸의 오류는 지운다
  const set = (patch: Partial<ShipToInput>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setErrors((e) => {
      const keys = Object.keys(patch).filter((k) => k in e)
      if (keys.length === 0) return e
      const next = { ...e }
      for (const k of keys) delete next[k]
      return next
    })
  }
  const id = (key: string) => `ship-to-${key}`

  // 주소가 바뀌면 지역 기본 배송센터를 다시 물어본다 (동기화 중이면 거래처 주소 기준은 저장 때)
  const zip = draft.zipCode ?? ''
  const region = draft.regionCode ?? ''
  useEffect(() => {
    if (!shipperId || (!zip && !region)) return
    let alive = true
    void previewShipToCenterAction({ shipperId, zipCode: zip, regionCode: region }).then(
      (result) => {
        if (alive) setRegionDefault(result.ok ? result.data : null)
      },
    )
    return () => {
      alive = false
    }
  }, [shipperId, zip, region])

  function apply() {
    const parsed = shipToSchema.safeParse(draft)
    const next: Record<string, string> = parsed.success
      ? {}
      : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.') || 'row', i.message]))
    const code = (draft.code ?? '').trim().toUpperCase()
    if (code && existingCodes.includes(code)) next.code = '이 거래처에 이미 있는 납품처코드입니다.'
    if (Object.keys(next).length > 0) {
      setErrors(next)
      return
    }
    onApply({ ...draft, code })
  }

  const sync = draft.isDefault && draft.addrSync
  const manual = draft.centerMode === 'MANUAL'
  const mismatch =
    manual &&
    regionDefault &&
    draft.deliveryCenterId &&
    regionDefault.centerId !== draft.deliveryCenterId

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isNew ? '납품처 추가' : `납품처 ${row.code}`}</SheetTitle>
          <SheetDescription>
            [적용]하면 납품처 표에 반영되고, 화면 아래 [저장] 때 거래처와 함께 저장됩니다.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-section px-4">
          <FormGrid>
            <Field
              label="납품처코드"
              span={6}
              error={errors.code}
              htmlFor={id('code')}
              hint={isNew ? '등록 후 바꿀 수 없습니다' : '바꿀 수 없습니다'}
            >
              <Input
                id={id('code')}
                value={draft.code}
                onChange={(e) => set({ code: e.target.value })}
                disabled={disabled || !isNew}
                maxLength={40}
                placeholder="비워 두면 자동 생성 ({거래처코드}-01)"
              />
            </Field>
            <Field label="상태" span={6} htmlFor={id('status')}>
              <Select
                value={draft.status}
                onValueChange={(status) => set({ status })}
                disabled={disabled || draft.isDefault}
              >
                <SelectTrigger id={id('status')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIP_TO_STATUS.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="사용자 정의 코드"
              span={6}
              error={errors.custCode}
              htmlFor={id('custCode')}
              hint="화주 시스템의 납품처코드 (선택)"
            >
              <Input
                id={id('custCode')}
                value={draft.custCode ?? ''}
                onChange={(e) => set({ custCode: e.target.value })}
                disabled={disabled}
                maxLength={50}
              />
            </Field>
            <Field label="납품처명" span={12} required error={errors.name} htmlFor={id('name')}>
              <Input
                id={id('name')}
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                disabled={disabled}
                maxLength={100}
              />
            </Field>
            {draft.isDefault && (
              <Field
                label="거래처 주소와 동기화"
                span={12}
                htmlFor={id('addrSync')}
                hint="켜 두면 거래처 주소를 바꿀 때 이 납품처 주소도 바뀌고 배송센터를 다시 정합니다"
              >
                <YnToggle
                  id={id('addrSync')}
                  value={draft.addrSync}
                  onChange={(addrSync) => set({ addrSync })}
                  disabled={disabled}
                  onLabel="동기화"
                  offLabel="직접 입력"
                />
              </Field>
            )}
            {sync ? (
              <Field label="주소" span={12} htmlFor={id('synced-address')}>
                <Input
                  id={id('synced-address')}
                  value={customerAddress || '거래처 주소를 먼저 입력하세요'}
                  disabled
                  readOnly
                />
              </Field>
            ) : (
              <Field label="주소" span={12} required htmlFor={id('address-address')}>
                <AddressInput
                  idPrefix={id('address')}
                  value={{
                    zipCode: draft.zipCode ?? '',
                    address: draft.address ?? '',
                    addressDetail: draft.addressDetail ?? '',
                  }}
                  onChange={(address) => set(address)}
                  onRegionCode={(regionCode) => set({ regionCode })}
                  disabled={disabled}
                  errors={{ address: errors.address }}
                />
              </Field>
            )}
            <Field label="수령 담당자" span={4} htmlFor={id('receiverName')}>
              <Input
                id={id('receiverName')}
                value={draft.receiverName ?? ''}
                onChange={(e) => set({ receiverName: e.target.value })}
                disabled={disabled}
                maxLength={50}
              />
            </Field>
            <Field
              label="수령 연락처"
              span={4}
              error={errors.receiverPhone}
              htmlFor={id('receiverPhone')}
            >
              <PhoneInput
                id={id('receiverPhone')}
                value={draft.receiverPhone ?? ''}
                onChange={(receiverPhone) => set({ receiverPhone })}
                disabled={disabled}
              />
            </Field>
            <Field
              label="수령 연락처2"
              span={4}
              error={errors.receiverPhone2}
              htmlFor={id('receiverPhone2')}
            >
              <PhoneInput
                id={id('receiverPhone2')}
                value={draft.receiverPhone2 ?? ''}
                onChange={(receiverPhone2) => set({ receiverPhone2 })}
                disabled={disabled}
              />
            </Field>
            <Field label="배송 메모" span={12} htmlFor={id('deliveryMemo')}>
              <Input
                id={id('deliveryMemo')}
                value={draft.deliveryMemo ?? ''}
                placeholder="예: 후문 하차, 사전 연락"
                onChange={(e) => set({ deliveryMemo: e.target.value })}
                disabled={disabled}
                maxLength={200}
              />
            </Field>
            <Field
              label="배송센터"
              span={12}
              error={errors.deliveryCenterId}
              htmlFor={id('center')}
              hint={
                regionDefault
                  ? `이 지역의 기본 배송센터: ${regionDefault.centerName}`
                  : '권역 자동이면 저장할 때 주소로 정합니다 (못 정하면 "확인 필요")'
              }
            >
              <Select
                value={manual ? draft.deliveryCenterId || AUTO : AUTO}
                onValueChange={(v) =>
                  v === AUTO
                    ? set({ centerMode: 'AUTO', deliveryCenterId: '' })
                    : set({ centerMode: 'MANUAL', deliveryCenterId: v })
                }
                disabled={disabled}
              >
                <SelectTrigger id={id('center')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>권역 자동 (주소로 정함)</SelectItem>
                  {centers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.code}){regionDefault?.centerId === c.id ? ' · 지역 기본' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {mismatch && (
              <p className="col-span-12 flex items-center gap-1.5 text-xs text-warning">
                <TriangleAlertIcon className="size-3.5" />이 지역의 기본 배송센터는{' '}
                {regionDefault!.centerName}입니다. 다르게 지정하면 ‘권역 불일치’로 표시됩니다.
              </p>
            )}
            <Field label="비고" span={12} htmlFor={id('remark')}>
              <Textarea
                id={id('remark')}
                rows={2}
                value={draft.remark ?? ''}
                onChange={(e) => set({ remark: e.target.value })}
                disabled={disabled}
              />
            </Field>
          </FormGrid>
          {errors.row && <p className="text-sm text-destructive">{errors.row}</p>}
        </div>
        <SheetFooter className="flex-row flex-wrap justify-between border-t">
          {!isNew ? (
            <Button
              type="button"
              variant="outline"
              onClick={onRemove}
              disabled={disabled || Boolean(removeBlocked)}
              title={removeBlocked ?? undefined}
            >
              <Trash2Icon />
              빼기
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {draft.isDefault && <StatusBadge tone="info">기본 납품처</StatusBadge>}
            <Button type="button" variant="outline" onClick={onClose}>
              닫기
            </Button>
            <Button type="button" onClick={apply} disabled={disabled}>
              적용
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
