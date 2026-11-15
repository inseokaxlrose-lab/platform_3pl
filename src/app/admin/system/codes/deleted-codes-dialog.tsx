'use client'

import { ArchiveRestoreIcon, Trash2Icon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { formatDate } from '@/components/data-grid'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ActionResult } from '@/lib/actions'
import { listDeletedCodesAction, restoreCodeGroupAction, restoreCodeItemAction } from './actions'

type Deleted = Extract<Awaited<ReturnType<typeof listDeletedCodesAction>>, { ok: true }>['data']

// 지운 코드 그룹·코드 보기 + [되살리기] (docs/decisions/0038)
// 공통코드 화면은 두 칸 구조라 목록 "삭제됨" 거르기 대신 팝업으로 모아 보여 준다
export function DeletedCodesDialog({ onRestored }: { onRestored: () => void }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Deleted | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function load() {
    startTransition(async () => {
      const result = await listDeletedCodesAction({})
      if (result.ok) setData(result.data)
      else setMessage(result.error.message)
    })
  }

  function restore(run: () => Promise<ActionResult<unknown>>) {
    startTransition(async () => {
      const result = await run()
      if (!result.ok) {
        setMessage(result.error.message)
        return
      }
      setMessage('되살렸습니다.')
      onRestored()
      const next = await listDeletedCodesAction({})
      if (next.ok) setData(next.data)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true)
          setMessage(null)
          load()
        }}
      >
        <Trash2Icon />
        지운 항목
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>지운 코드 그룹 · 코드</DialogTitle>
            <DialogDescription>
              되살리면 지우기 전 상태로 목록에 다시 나타납니다. 같은 코드를 이미 다시 만들었으면
              되살릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {message && (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          )}
          <DeletedList
            title="코드 그룹"
            rows={(data?.groups ?? []).map((g) => ({
              id: g.id,
              label: `${g.name} (${g.code})`,
              deletedAt: g.updatedAt,
            }))}
            pending={pending}
            onRestore={(id) => restore(() => restoreCodeGroupAction({ id }))}
          />
          <DeletedList
            title="코드"
            rows={(data?.items ?? []).map((i) => ({
              id: i.id,
              label: `${i.name} (${i.code})`,
              sub: i.groupLabel,
              deletedAt: i.updatedAt,
              blocked: i.groupDeleted ? '그룹을 먼저 되살려 주세요' : undefined,
            }))}
            pending={pending}
            onRestore={(id) => restore(() => restoreCodeItemAction({ id }))}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

type DeletedRow = { id: string; label: string; sub?: string; deletedAt: Date; blocked?: string }

// 지운 항목 한 묶음 (그룹 / 코드)
function DeletedList({
  title,
  rows,
  pending,
  onRestore,
}: {
  title: string
  rows: DeletedRow[]
  pending: boolean
  onRestore: (id: string) => void
}) {
  return (
    <section aria-label={`지운 ${title}`} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">{rows.length}개</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">지운 항목이 없습니다.</p>
      ) : (
        <ul className="max-h-60 divide-y overflow-y-auto rounded-md border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">{row.label}</p>
                <p className="text-xs text-muted-foreground">
                  {row.sub ? `${row.sub} · ` : ''}지운 때 {formatDate(row.deletedAt, true)}
                  {row.blocked ? ` · ${row.blocked}` : ''}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || Boolean(row.blocked)}
                onClick={() => onRestore(row.id)}
              >
                <ArchiveRestoreIcon />
                되살리기
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
