'use client'

import { ImageIcon, Trash2Icon, UploadIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/lib/actions'
import { fileUrl, IMAGE_ACCEPT, MAX_FILE_BYTES } from '@/lib/files/file-codes'

// 한 장짜리 이미지 칸 (docs/decisions/0091): 운영사 로고·직인
// 고르면 바로 저장되고 화면을 다시 읽는다. 수정 권한이 없으면 보기만
export function ImageSlot({
  label,
  fileId,
  canEdit,
  save,
}: {
  label: string
  fileId: string | null
  canEdit: boolean
  // file이 null이면 지우기
  save: (file: File | null) => Promise<ActionResult<unknown>>
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(file: File | null) {
    if (file && file.size > MAX_FILE_BYTES) {
      setMessage(`파일은 ${MAX_FILE_BYTES / 1024 / 1024}MB까지입니다.`)
      return
    }
    setMessage(null)
    startTransition(async () => {
      const result = await save(file)
      if (!result.ok) setMessage(result.error.message)
      if (input.current) input.current.value = ''
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex size-32 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {fileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(fileId)} alt={label} className="size-full object-contain" />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" aria-label={`${label} 없음`} />
        )}
      </div>
      {canEdit && (
        <div className="flex gap-1">
          <input
            ref={input}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => run(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            <UploadIcon />
            {fileId ? '바꾸기' : '올리기'}
          </Button>
          {fileId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(null)}
              aria-label={`${label} 지우기`}
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
      )}
      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  )
}
