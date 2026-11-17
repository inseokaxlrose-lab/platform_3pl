'use client'

import { ArrowRightIcon } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { applyRegionAssignAction, previewRegionAssignAction } from './actions'

// 변경 미리보기 (모든 저장 공통): 센터별 '전 → 후 n건', 경계 우편번호 포함/제외, 사유 → [저장]
// 저장은 서버가 같은 계산을 다시 해서 작업 단위 1건 + 배정표 + 이력을 한 트랜잭션으로 남긴다

export type ChangeRequest = {
  title: string
  target:
    | {
        kind: 'node'
        node: { level: 'SIDO' | 'SIGUNGU' | 'EMD'; code: string }
        includeBoundary: boolean
      }
    | { kind: 'zips'; source: 'GRID' | 'PASTE'; zips: string[] }
  tempZone: string
  centerId: string | null
}

type Preview = Extract<Awaited<ReturnType<typeof previewRegionAssignAction>>, { ok: true }>['data']

export function RegionChangeDialog({
  request,
  onClose,
  onSaved,
}: {
  request: ChangeRequest | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  // 요청이 바뀌면 부모가 key를 바꿔 새로 그린다 (경계·사유·미리보기가 처음 상태로)
  const [includeBoundary, setIncludeBoundary] = useState(false)
  // 미리보기 결과에 '어느 경계 선택의 결과인지'를 붙여 둔다 (선택을 바꾸면 계산 중으로 보인다)
  const [loaded, setLoaded] = useState<{
    boundary: boolean
    preview: Preview | null
    error: string | null
  } | null>(null)
  const [reason, setReason] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const target = request
    ? request.target.kind === 'node'
      ? { ...request.target, includeBoundary }
      : request.target
    : null

  // 열릴 때·경계 포함 여부를 바꿀 때 미리보기를 다시 계산
  useEffect(() => {
    if (!request || !target) return
    let cancelled = false
    previewRegionAssignAction({
      target,
      tempZone: request.tempZone,
      centerId: request.centerId,
    }).then((result) => {
      if (cancelled) return
      setLoaded(
        result.ok
          ? { boundary: includeBoundary, preview: result.data, error: null }
          : { boundary: includeBoundary, preview: null, error: result.error.message },
      )
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, includeBoundary])

  const current = loaded && loaded.boundary === includeBoundary ? loaded : null
  const preview = current?.preview ?? null
  const error = saveError ?? current?.error ?? null

  const save = () =>
    startTransition(async () => {
      if (!request || !target) return
      const result = await applyRegionAssignAction({
        target,
        tempZone: request.tempZone,
        centerId: request.centerId,
        reason: reason || undefined,
      })
      if (!result.ok) {
        setSaveError(result.error.message)
        return
      }
      onSaved(
        `${result.data.changeCount}건을 반영했습니다.${result.data.invalidCount ? ` (제외 ${result.data.invalidCount}건)` : ''}`,
      )
    })

  const unassigning = request?.centerId === null
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{request?.title ?? '변경 미리보기'}</DialogTitle>
          <DialogDescription>
            {preview?.scopeDesc ?? '바뀌는 배정을 계산하고 있습니다…'}
          </DialogDescription>
        </DialogHeader>

        {preview && (
          <div className="space-y-4 text-sm">
            {preview.boundary && preview.boundary.count > 0 && (
              <fieldset className="space-y-2 rounded-md border p-3">
                <legend className="px-1 text-sm font-medium">
                  경계 우편번호 {preview.boundary.count}건 (다른 읍면동에도 걸친 우편번호)
                </legend>
                <div className="flex gap-4">
                  {[
                    { value: false, label: '제외' },
                    { value: true, label: '포함' },
                  ].map((option) => (
                    <label key={option.label} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="boundary"
                        checked={includeBoundary === option.value}
                        onChange={() => setIncludeBoundary(option.value)}
                        disabled={pending || !current}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  하나씩 다르게 정하려면 제외하고 오른쪽 표에서 그 우편번호만 골라 지정하세요.
                </p>
              </fieldset>
            )}

            <div className="space-y-2">
              <p className="font-medium">
                바뀌는 배정 {preview.changeCount.toLocaleString()}건
                <span className="ml-2 font-normal text-muted-foreground">
                  (이미 같음 {preview.unchanged.toLocaleString()}건)
                </span>
              </p>
              {preview.summary.length === 0 ? (
                <p className="text-muted-foreground">바뀌는 것이 없습니다.</p>
              ) : (
                <ul className="space-y-1">
                  {preview.summary.map((s) => (
                    <li key={`${s.from}>${s.to}`} className="flex items-center gap-2">
                      <StatusBadge tone={s.from ? 'info' : 'warning'}>
                        {s.from ?? '미배정'}
                      </StatusBadge>
                      <ArrowRightIcon className="size-4 text-muted-foreground" />
                      <StatusBadge tone={s.to ? 'success' : 'warning'}>
                        {s.to ?? '미배정'}
                      </StatusBadge>
                      <span>{s.count.toLocaleString()}건</span>
                    </li>
                  ))}
                </ul>
              )}
              {unassigning && preview.changeCount > 0 && (
                <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  배정을 해제하면 미배정 지역이 생깁니다. 이 지역 주소는 배송센터를 직접 확인해야
                  합니다.
                </p>
              )}
            </div>

            {preview.invalidCount > 0 && (
              <div className="space-y-1">
                <p className="font-medium text-destructive">
                  제외되는 우편번호 {preview.invalidCount}건
                </p>
                <p className="text-xs text-muted-foreground">
                  {preview.invalid.map((i) => `${i.zipCode}(${i.reason})`).join(', ')}
                  {preview.invalidCount > preview.invalid.length && ' …'}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="region-change-reason">변경 사유 (선택)</Label>
              <Textarea
                id="region-change-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 평택센터 개장으로 경기 남부 이관"
                rows={2}
              />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={pending || !preview || preview.changeCount === 0}
          >
            {pending ? '처리 중…' : `저장 (${preview?.changeCount.toLocaleString() ?? 0}건)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
