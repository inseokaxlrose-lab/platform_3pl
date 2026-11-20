'use client'

import { ImageSlot } from '@/components/files'
import { setOperatorImageAction } from '@/lib/files/file-actions'

// 운영사 로고·직인 (0091): 고르면 바로 저장 — 출력물(라벨·명세서 등)에 쓴다
export function OperatorImages({
  logoFileId,
  stampFileId,
  canEdit,
}: {
  logoFileId: string | null
  stampFileId: string | null
  canEdit: boolean
}) {
  return (
    <div className="flex flex-wrap gap-8">
      <ImageSlot
        label="로고"
        fileId={logoFileId}
        canEdit={canEdit}
        save={(file) => setOperatorImageAction({ kind: 'logo', file })}
      />
      <ImageSlot
        label="직인"
        fileId={stampFileId}
        canEdit={canEdit}
        save={(file) => setOperatorImageAction({ kind: 'stamp', file })}
      />
    </div>
  )
}
