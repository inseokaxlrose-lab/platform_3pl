'use client'

import { useEffect, useRef, useState } from 'react'
import { PageHeader, type PageHeaderProps } from '@/components/common/page-header'
import { cn } from '@/lib/utils'

type AppPageProps = PageHeaderProps & {
  // full: 화면 전체 폭 (목록) / form: 왼쪽 목차 + 본문 최대 폭, 왼쪽 정렬 (편집)
  variant?: 'full' | 'form'
  // form일 때 왼쪽 목차
  aside?: React.ReactNode
  children: React.ReactNode
}

// 공통 페이지 틀 (docs/ui-guidelines.md "페이지 틀") — 목록·편집 화면이 모두 이 틀을 쓴다
// - 헤더는 화면 전체 폭, 스크롤해도 상단 바 아래에 붙어 있고, 스크롤하면 아래 그림자
// - 좌우 여백·헤더-본문 간격은 토큰(page)으로 같게 → 제목·[도움말]·본문 시작선이 화면마다 같은 자리
// - 헤더 높이를 CSS 변수(--page-header-h)로 알려 목차·섹션 이동 위치를 헤더 아래로 맞춘다
export function AppPage({ variant = 'full', aside, children, ...header }: AppPageProps) {
  const sentinel = useRef<HTMLDivElement>(null)
  const headerBox = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(0)

  // 헤더가 상단 바(3.5rem) 아래에 붙었는지: 바로 위 표식이 화면 밖으로 나가면 붙은 것
  useEffect(() => {
    const target = sentinel.current
    if (!target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  // 헤더 높이 (설명·버튼 줄바꿈에 따라 달라진다)
  useEffect(() => {
    const box = headerBox.current
    // 크기 감시가 없는 환경(테스트 등)에서는 목차 위치만 기본값으로 둔다
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setHeaderHeight(box.offsetHeight))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="flex flex-col"
      style={{ '--page-header-h': `${headerHeight}px` } as React.CSSProperties}
    >
      <div ref={sentinel} aria-hidden className="h-0" />
      {/* 본문 여백(page)만큼 바깥으로 넓혀 화면 전체 폭으로 붙인다 */}
      <div
        ref={headerBox}
        data-stuck={stuck || undefined}
        className={cn(
          'sticky top-14 z-20 -mx-page -mt-page bg-background px-page pt-page pb-4 transition-shadow',
          stuck && 'border-b shadow-sm',
        )}
      >
        <PageHeader {...header} />
      </div>
      <div className="mt-2">
        {variant === 'full' ? (
          <div className="flex flex-col gap-section">{children}</div>
        ) : (
          <div className="lg:grid lg:grid-cols-[var(--spacing-toc)_minmax(0,1fr)] lg:gap-page">
            {aside && <div className="hidden lg:block">{aside}</div>}
            <div className="max-w-form min-w-0">{children}</div>
          </div>
        )}
      </div>
    </div>
  )
}
