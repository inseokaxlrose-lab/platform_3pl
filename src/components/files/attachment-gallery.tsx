'use client'

import { ImagePlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import {
  deleteAttachmentAction,
  listAttachmentsAction,
  uploadAttachmentAction,
} from '@/lib/files/file-actions'
import {
  fileUrl,
  formatBytes,
  IMAGE_ACCEPT,
  MAX_FILE_BYTES,
  MAX_FILES_PER_ENTITY,
  type FileEntity,
} from '@/lib/files/file-codes'

type Attachment = { id: string; name: string; size: number; createdBy: string }

// 첨부 사진 목록 (docs/decisions/0091): 품목 이미지·검수 사진처럼 한 대상에 여러 장
// 올리면 바로 저장된다(양식의 [저장]과 따로). 수정 권한이 없으면 보기만
export function AttachmentGallery({
  entity,
  id,
  canEdit,
  emptyText = '붙인 이미지가 없습니다.',
}: {
  entity: FileEntity
  id: string
  canEdit: boolean
  emptyText?: string
}) {
  const [items, setItems] = useState<Attachment[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  // 다시 읽기: 숫자를 바꾸면 아래 effect가 목록을 새로 읽는다
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let alive = true
    listAttachmentsAction({ entity, id }).then((result) => {
      if (!alive) return
      if (result.ok) setItems(result.data)
      else setMessage(result.error.message)
    })
    return () => {
      alive = false
    }
  }, [entity, id, version])

  function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setMessage(null)
    startTransition(async () => {
      for (const file of Array.from(files)) {
        // 큰 파일은 보내기 전에 막는다 (서버도 다시 검사)
        if (file.size > MAX_FILE_BYTES) {
          setMessage(`${file.name}: 파일은 ${MAX_FILE_BYTES / 1024 / 1024}MB까지입니다.`)
          continue
        }
        const result = await uploadAttachmentAction({ entity, id, file })
        if (!result.ok) setMessage(`${file.name}: ${result.error.message}`)
      }
      if (input.current) input.current.value = ''
      reload()
    })
  }

  return (
    <div className="space-y-3">
      {items === null ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-md border bg-card">
              <a href={fileUrl(item.id)} target="_blank" rel="noreferrer" title="크게 보기">
                {/* 로그인·범위를 확인해 내려 주는 주소라 next/image 최적화를 쓰지 않는다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl(item.id)}
                  alt={item.name}
                  loading="lazy"
                  className="aspect-square w-full bg-muted object-contain"
                />
              </a>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                <span className="min-w-0 truncate" title={item.name}>
                  {item.name}
                  <span className="ml-1 text-muted-foreground">{formatBytes(item.size)}</span>
                </span>
                {canEdit && (
                  <ConfirmDialog
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        aria-label={`${item.name} 지우기`}
                      >
                        <Trash2Icon />
                      </Button>
                    }
                    title="이미지를 지울까요?"
                    description={`'${item.name}'을(를) 지웁니다. 되돌릴 수 없습니다.`}
                    confirmLabel="지우기"
                    destructive
                    onConfirm={async () => {
                      unwrap(await deleteAttachmentAction({ entity, id, fileId: item.id }))
                      reload()
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            hidden
            onChange={(e) => upload(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || (items?.length ?? 0) >= MAX_FILES_PER_ENTITY}
            onClick={() => input.current?.click()}
          >
            <ImagePlusIcon />
            {pending ? '올리는 중…' : '이미지 올리기'}
          </Button>
          <span className="text-xs text-muted-foreground">
            PNG·JPEG·WEBP·GIF, 한 장 {MAX_FILE_BYTES / 1024 / 1024}MB · 최대 {MAX_FILES_PER_ENTITY}
            장
          </span>
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  )
}
