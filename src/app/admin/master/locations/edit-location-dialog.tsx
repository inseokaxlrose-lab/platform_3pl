'use client'

import { useState, useTransition } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { updateLocationAction } from './actions'

// 고칠 로케이션 (목록 줄)
export type EditableLocation = {
  id: string
  code: string
  name: string
  remark: string | null
  warehouse: string
  // 동시 수정 막기: 팝업을 연 목록의 버전
  rowVersion: number
}

// 로케이션 명칭·비고 수정 팝업 (0071): 코드는 바꿀 수 없다. 명칭을 비우면 코드와 같게
export function EditLocationDialog({
  location,
  onOpenChange,
  readOnly,
  onSaved,
}: {
  // 없으면 닫힘
  location: EditableLocation | null
  onOpenChange: (open: boolean) => void
  readOnly: boolean
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [remark, setRemark] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 팝업을 열 때마다 그 로케이션 값으로 다시 채운다
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const key = location?.id ?? null
  if (key !== openedFor) {
    setOpenedFor(key)
    if (location) {
      setName(location.name)
      setRemark(location.remark ?? '')
      setError(null)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!location) return
    startTransition(async () => {
      const result = await updateLocationAction({
        id: location.id,
        rowVersion: location.rowVersion,
        name,
        remark,
      })
      if (!result.ok) {
        setError(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message)
        return
      }
      onOpenChange(false)
      onSaved()
    })
  }

  const disabled = readOnly || pending
  return (
    <Dialog open={location !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>로케이션 — {location?.code}</DialogTitle>
            <DialogDescription>{location?.warehouse} · 코드는 바꿀 수 없습니다.</DialogDescription>
          </DialogHeader>
          <FormGrid>
            <Field
              span={12}
              label="명칭"
              htmlFor="edit-location-name"
              hint="비우면 코드와 같게 저장합니다"
            >
              <Input
                id="edit-location-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                disabled={disabled}
              />
            </Field>
            <Field span={12} label="비고" htmlFor="edit-location-remark">
              <Textarea
                id="edit-location-remark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={3}
                maxLength={1000}
                disabled={disabled}
              />
            </Field>
          </FormGrid>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
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
