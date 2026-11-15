'use client'

import { ArchiveRestoreIcon } from 'lucide-react'
import { ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import { unwrap, type ActionResult } from '@/lib/actions'

// 목록 상태 거르기의 "삭제됨" 선택지 (지운 항목 보기 → [되살리기], docs/decisions/0038)
// 지울 수 있는 목록만 상태 선택지에 이것을 더한다
export const DELETED_STATUS_OPTION = { value: 'DELETED', label: '삭제됨' } as const

// 지금 목록이 "삭제됨" 보기인지 (이때 일괄 처리는 [되살리기]만)
export const isDeletedView = (values: Record<string, string | undefined>) =>
  values.status === DELETED_STATUS_OPTION.value

// 일괄 [되살리기] 버튼: 고른 항목을 되살리기 전에 건수를 확인한다
// 같은 코드가 이미 다시 쓰이고 있으면 서버가 거부하고 이유를 보여준다
export function RestoreButton({
  ids,
  noun,
  restore,
  done,
}: {
  ids: string[]
  // 대상 이름 (예: '로케이션')
  noun: string
  restore: (ids: string[]) => Promise<ActionResult<unknown>>
  done: () => void
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" disabled={ids.length === 0}>
          <ArchiveRestoreIcon />
          되살리기
          {ids.length > 0 && ` (${ids.length})`}
        </Button>
      }
      title={`${noun} ${ids.length}개를 되살릴까요?`}
      description="지우기 전 상태(사용·사용 중지)로 목록에 다시 나타납니다. 외부 코드는 되살아나지 않으니 필요하면 다시 입력하세요."
      confirmLabel="되살리기"
      onConfirm={async () => {
        unwrap(await restore(ids))
        done()
      }}
    />
  )
}
