'use client'

import { Trash2Icon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/common'
import { Field, FormGrid } from '@/components/master-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FAULT_PARTY_LABELS } from '@/config/db-codes'
import { unwrap, type ActionResult } from '@/lib/actions'

// 그룹·코드 공용 입력 값 (두 표의 칸이 같다. 귀책 칸만 그룹·코드가 다르다 — 0087)
export type CodeFormValue = {
  code: string
  name: string
  description: string
  sortOrder: number
  isActive: boolean
  // 그룹: 코드마다 귀책을 둘지
  usesFaultParty: boolean
  // 코드: 귀책 (비우면 없음)
  faultParty: string
}

export const EMPTY_CODE_FORM: CodeFormValue = {
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  isActive: true,
  usesFaultParty: false,
  faultParty: '',
}

const NO_FAULT = '__none__'

type CodeEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // 'create'면 코드를 입력받고, 'edit'면 코드를 보여주기만 한다 (등록 후 변경 불가)
  mode: 'create' | 'edit'
  title: string
  codeLabel: string
  codePlaceholder: string
  initial: CodeFormValue
  // 시스템 그룹처럼 사용 중지·삭제를 막을 때 안내 문구
  lockedNote?: string
  // 'group': [귀책 구분 사용] 체크 / 'item': [귀책] 고르기 (그룹이 귀책을 쓸 때만)
  faultField?: 'group' | 'item'
  onSave: (value: CodeFormValue) => Promise<ActionResult<unknown>>
  // 주면 [삭제] 버튼이 생긴다 (수정 화면에서만)
  onDelete?: () => Promise<ActionResult<unknown>>
  deleteDescription?: string
  onDone: () => void
}

// 공통코드 그룹·코드 등록/수정 팝업 (docs/decisions/0030)
export function CodeEditDialog({
  open,
  onOpenChange,
  mode,
  title,
  codeLabel,
  codePlaceholder,
  initial,
  lockedNote,
  faultField,
  onSave,
  onDelete,
  deleteDescription,
  onDone,
}: CodeEditDialogProps) {
  const [value, setValue] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 팝업을 열 때마다 새 값으로 시작 (열린 대상이 바뀌면 다시 채운다)
  const [openedWith, setOpenedWith] = useState(initial)
  if (open && openedWith !== initial) {
    setOpenedWith(initial)
    setValue(initial)
    setErrors({})
    setMessage(null)
  }

  const set = (patch: Partial<CodeFormValue>) => setValue((previous) => ({ ...previous, ...patch }))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await onSave(value)
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
        setMessage(
          Object.keys(fieldErrors).length > 0 ? '입력값을 확인해 주세요.' : result.error.message,
        )
        return
      }
      onOpenChange(false)
      onDone()
    })
  }

  const id = (key: string) => `code-edit-${key}`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? `${codeLabel}는 등록 후 바꿀 수 없습니다.`
                : '이름·설명·정렬 순서·사용 여부를 고칠 수 있습니다.'}
            </DialogDescription>
          </DialogHeader>

          <FormGrid>
            <Field span={6} label={codeLabel} required error={errors.code} htmlFor={id('code')}>
              {mode === 'create' ? (
                <Input
                  id={id('code')}
                  value={value.code}
                  onChange={(e) => set({ code: e.target.value })}
                  placeholder={codePlaceholder}
                  disabled={pending}
                  aria-invalid={Boolean(errors.code)}
                  className="uppercase"
                />
              ) : (
                <Input id={id('code')} value={value.code} readOnly disabled />
              )}
            </Field>
            <Field span={6} label="정렬 순서" error={errors.sortOrder} htmlFor={id('sortOrder')}>
              <Input
                id={id('sortOrder')}
                type="number"
                min={0}
                max={9999}
                value={value.sortOrder}
                onChange={(e) => set({ sortOrder: Number(e.target.value) })}
                disabled={pending}
                aria-invalid={Boolean(errors.sortOrder)}
              />
            </Field>
          </FormGrid>
          <Field span={12} label="이름" required error={errors.name} htmlFor={id('name')}>
            <Input
              id={id('name')}
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              disabled={pending}
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          <Field span={12} label="설명" error={errors.description} htmlFor={id('description')}>
            <Input
              id={id('description')}
              value={value.description}
              onChange={(e) => set({ description: e.target.value })}
              disabled={pending}
            />
          </Field>
          {faultField === 'item' && (
            <Field
              span={12}
              label="귀책"
              htmlFor={id('faultParty')}
              hint="사유를 귀책별로 집계할 때 씁니다"
            >
              <Select
                value={value.faultParty || NO_FAULT}
                onValueChange={(v) => set({ faultParty: v === NO_FAULT ? '' : v })}
                disabled={pending}
              >
                <SelectTrigger id={id('faultParty')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FAULT}>정하지 않음</SelectItem>
                  {Object.entries(FAULT_PARTY_LABELS).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {faultField === 'group' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={id('usesFaultParty')}
                checked={value.usesFaultParty}
                onCheckedChange={(checked) => set({ usesFaultParty: checked === true })}
                disabled={pending}
              />
              <Label htmlFor={id('usesFaultParty')}>귀책 구분 사용</Label>
              <span className="text-xs text-muted-foreground">
                사유 코드처럼 코드마다 귀책(화주·센터·운송사·기타)을 둡니다.
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id={id('isActive')}
              checked={value.isActive}
              onCheckedChange={(checked) => set({ isActive: checked === true })}
              disabled={pending || Boolean(lockedNote)}
            />
            <Label htmlFor={id('isActive')}>사용</Label>
            <span className="text-xs text-muted-foreground">
              {lockedNote ??
                '끄면 새로 고르는 목록에서 숨깁니다. 이미 저장된 값은 그대로 보입니다.'}
            </span>
          </div>

          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}

          <DialogFooter className="sm:justify-between">
            {onDelete && !lockedNote ? (
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
                title={`'${value.code}'를 삭제할까요?`}
                description={deleteDescription}
                confirmLabel="삭제"
                destructive
                onConfirm={async () => {
                  unwrap(await onDelete())
                  onOpenChange(false)
                  onDone()
                }}
              />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
