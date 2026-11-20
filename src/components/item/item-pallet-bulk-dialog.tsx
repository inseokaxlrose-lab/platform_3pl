'use client'

import { useState } from 'react'
import { NumberInput } from '@/components/inputs'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ActionResult } from '@/lib/actions/result'
import type { PalletBulkResult } from '@/lib/items/item-bulk'
import type { ItemPalletOption } from '@/lib/items/item-form-options'

// "선택 안 함" (Select는 빈 글자를 값으로 못 쓴다)
const NONE = '__none__'

type PalletInput = {
  palletTypeCode: string
  palletTi: number | null
  palletHi: number | null
  palletBoxQty: number | null
}

// 팔레트 적재 일괄 입력 (0083 ②): 고른 품목에 팔레트 종류·TI·HI를 넣고 PLT를 다시 계산한다
// BOX가 없는 등 계산할 수 없는 품목은 건너뛰고 결과에 알린다
export function ItemPalletBulkDialog({
  ids,
  pallets,
  defaultPalletType,
  trigger,
  action,
  onDone,
}: {
  ids: string[]
  pallets: ItemPalletOption[]
  defaultPalletType: string
  trigger: React.ReactElement
  action: (input: PalletInput & { ids: string[] }) => Promise<ActionResult<PalletBulkResult>>
  onDone: (result: PalletBulkResult) => void
}) {
  const empty: PalletInput = {
    palletTypeCode: defaultPalletType,
    palletTi: null,
    palletHi: null,
    palletBoxQty: null,
  }
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<PalletInput>(empty)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tiHi = Boolean(value.palletTi && value.palletHi)
  const ready = tiHi || Boolean(value.palletBoxQty)

  function change(next: boolean) {
    if (pending) return
    setOpen(next)
    if (!next) {
      setValue(empty)
      setError(null)
    }
  }

  async function save() {
    setPending(true)
    setError(null)
    const result = await action({ ...value, palletBoxQty: tiHi ? null : value.palletBoxQty, ids })
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setOpen(false)
    setValue(empty)
    onDone(result.data)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>팔레트 적재 일괄 입력 ({ids.length}개)</DialogTitle>
          <DialogDescription>
            고른 품목에 팔레트 종류·단당 박스 수(TI)·단수(HI)를 넣고 PLT를 다시 계산합니다. BOX
            단위가 없는 품목은 건너뜁니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pallet-bulk-type">팔레트 종류</Label>
            <Select
              value={value.palletTypeCode || NONE}
              onValueChange={(code) =>
                setValue({ ...value, palletTypeCode: code === NONE ? '' : code })
              }
              disabled={pending}
            >
              <SelectTrigger id="pallet-bulk-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>선택 안 함 (규격·높이 계산 없음)</SelectItem>
                {pallets
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pallet-bulk-ti">단당 박스 수 (TI)</Label>
            <NumberInput
              id="pallet-bulk-ti"
              value={value.palletTi}
              onChange={(palletTi) => setValue({ ...value, palletTi })}
              min={1}
              max={999}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pallet-bulk-hi">단수 (HI)</Label>
            <NumberInput
              id="pallet-bulk-hi"
              value={value.palletHi}
              onChange={(palletHi) => setValue({ ...value, palletHi })}
              min={1}
              max={999}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pallet-bulk-box">팔레트당 박스 수</Label>
            <NumberInput
              id="pallet-bulk-box"
              value={tiHi ? value.palletTi! * value.palletHi! : value.palletBoxQty}
              onChange={(palletBoxQty) => setValue({ ...value, palletBoxQty })}
              min={1}
              max={99999}
              disabled={pending || tiHi}
            />
            <p className="text-xs text-muted-foreground">
              {tiHi ? 'TI × HI로 계산합니다' : 'TI·HI를 모르면 직접 입력'}
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => change(false)} disabled={pending}>
            취소
          </Button>
          <Button type="button" onClick={save} disabled={pending || !ready}>
            {pending ? '처리 중…' : '적용'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
