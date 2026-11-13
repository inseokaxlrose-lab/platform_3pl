'use client'

import { PlusIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { FormField } from '@/components/common'
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
import { createLocationAction } from './actions'
import type { WarehouseOption } from './queries'

// 로케이션 한 칸 추가 (작은 팝업). 로케이션을 추가할 수 있는 창고(일반·사용 중)만 고를 수 있다
export function AddLocationDialog({
  warehouses,
  initialWarehouseId,
  onAdded,
}: {
  warehouses: WarehouseOption[]
  initialWarehouseId?: string
  onAdded: () => void
}) {
  const addable = warehouses.filter((w) => w.addable)
  const [open, setOpen] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function openDialog() {
    setWarehouseId(addable.some((w) => w.id === initialWarehouseId) ? initialWarehouseId! : '')
    setCode('')
    setError(null)
    setOpen(true)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await createLocationAction({ warehouseId, code })
      if (!result.ok) {
        setError(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message)
        return
      }
      setOpen(false)
      onAdded()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={openDialog}>
        <PlusIcon />한 칸 추가
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>로케이션 추가</DialogTitle>
              <DialogDescription>
                코드는 등록 후 바꿀 수 없습니다. 여러 칸은 [일괄 생성]을 쓰세요.
              </DialogDescription>
            </DialogHeader>
            <FormField label="창고" required htmlFor="add-location-warehouse">
              <Select value={warehouseId} onValueChange={setWarehouseId} disabled={pending}>
                <SelectTrigger id="add-location-warehouse" className="w-full">
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
            </FormField>
            <FormField label="로케이션 코드" required htmlFor="add-location-code">
              <Input
                id="add-location-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="예: A-01-01"
                disabled={pending}
              />
            </FormField>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={pending || !warehouseId || !code.trim()}>
                {pending ? '추가 중…' : '추가'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
