'use client'

import { useState } from 'react'
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
import { assignShipTosCenterAction } from './actions'

type Center = { id: string; code: string; name: string }
type Result = Extract<Awaited<ReturnType<typeof assignShipTosCenterAction>>, { ok: true }>['data']

// 배송센터 일괄 지정 (0082 ②): 고른 납품처를 이 센터로 "수동" 지정한다
// 그 화주가 이용하지 않거나 사용 중이 아닌 센터면 그 납품처는 건너뛰고 결과에 알린다
export function ShipToCenterDialog({
  ids,
  centers,
  trigger,
  onDone,
}: {
  ids: string[]
  centers: Center[]
  trigger: React.ReactElement
  onDone: (result: Result) => void
}) {
  const [open, setOpen] = useState(false)
  const [centerId, setCenterId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function change(next: boolean) {
    if (pending) return
    setOpen(next)
    if (!next) {
      setCenterId('')
      setError(null)
    }
  }

  async function save() {
    setPending(true)
    setError(null)
    const result = await assignShipTosCenterAction({ ids, centerId })
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setOpen(false)
    setCenterId('')
    onDone(result.data)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>배송센터 일괄 지정 ({ids.length}곳)</DialogTitle>
          <DialogDescription>
            고른 납품처를 이 센터로 지정합니다(지정 구분 ‘수동’). 권역 기준 센터와 다르면 권역
            불일치로 표시됩니다. 화주가 이용하지 않는 센터인 납품처는 건너뜁니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="ship-to-bulk-center">배송센터</Label>
          <Select value={centerId} onValueChange={setCenterId} disabled={pending}>
            <SelectTrigger id="ship-to-bulk-center" className="w-full">
              <SelectValue placeholder="센터 선택" />
            </SelectTrigger>
            <SelectContent>
              {centers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Button type="button" onClick={save} disabled={pending || !centerId}>
            {pending ? '처리 중…' : '지정'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
