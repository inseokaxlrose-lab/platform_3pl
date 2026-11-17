'use client'

import { ZoomInIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { darkImageOf, isHelpImage } from '@/lib/help/help-images'

// 도움말 화면 사진 (0077): Markdown '![설명](/help/…/이름.png)'
// - 라이트·다크 사진 두 장을 테마에 맞게 하나만 보여 준다 (이름.png / 이름.dark.png)
// - 패널을 열 때만 불러오고(lazy), 누르면 크게 보기
// - /help/ 아래 사진만 그린다 (바깥 주소 사진은 설명 글자만 — 외부 추적·깨진 링크 방지)
export function HelpImage({ src, alt }: { src?: string; alt?: string }) {
  const label = alt ?? ''
  if (!src || !isHelpImage(src)) return <span className="text-muted-foreground">{label}</span>

  const pair = (className: string, eager = false) => (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- 정적 PNG, 라이트·다크 두 장을 CSS로 고른다 */}
      <img
        src={src}
        alt={label}
        loading={eager ? 'eager' : 'lazy'}
        className={`${className} dark:hidden`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={darkImageOf(src)}
        alt={label}
        loading={eager ? 'eager' : 'lazy'}
        className={`${className} hidden dark:block`}
      />
    </>
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`${label} 크게 보기`}
          className="group/img relative my-1 block w-full overflow-hidden rounded-md border bg-muted text-left"
        >
          {pair('block w-full')}
          <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/img:opacity-100 [&_svg]:size-3">
            <ZoomInIcon />
            크게 보기
          </span>
        </button>
      </DialogTrigger>
      {label && <span className="mt-1 block text-xs text-muted-foreground">{label}</span>}
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-5xl">
        <DialogTitle>{label || '화면 사진'}</DialogTitle>
        {pair('w-full rounded-md border', true)}
      </DialogContent>
    </Dialog>
  )
}
