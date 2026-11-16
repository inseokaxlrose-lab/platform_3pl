'use client'

import { HomeIcon, RotateCcwIcon, SearchXIcon, TriangleAlertIcon } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from './empty-state'

// 화면 상태 공통 부품 (docs/decisions/0066): 불러오는 중 · 오류 · 찾을 수 없음
// 영역(admin·portal·platform)의 loading.tsx / error.tsx / not-found.tsx가 쓴다

// 불러오는 중: 페이지 틀(제목 + 검색 + 표) 모양의 뼈대 — 화면이 덜컹거리지 않게 같은 자리를 잡는다
export function PageLoading() {
  return (
    <div role="status" aria-label="불러오는 중" className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <span className="sr-only">불러오는 중…</span>
    </div>
  )
}

// 오류: 사용자에게는 쉬운 문구만, 자세한 내용은 개발자 도구(콘솔)에만
export function PageError({
  error,
  reset,
  homeHref,
}: {
  error: Error & { digest?: string }
  reset: () => void
  homeHref: string
}) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div className="p-6">
      <EmptyState
        icon={<TriangleAlertIcon />}
        title="화면을 불러오지 못했습니다"
        description={
          <>
            잠시 후 다시 시도해 주세요. 계속되면 관리자에게 알려 주세요.
            {error.digest && (
              <span className="mt-1 block text-xs text-muted-foreground">
                오류 번호: {error.digest}
              </span>
            )}
          </>
        }
        action={
          <div className="flex gap-2">
            <Button type="button" onClick={reset}>
              <RotateCcwIcon />
              다시 시도
            </Button>
            <Button asChild variant="outline">
              <Link href={homeHref}>
                <HomeIcon />
                처음으로
              </Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}

// 찾을 수 없음: 없는 주소, 지웠거나 볼 수 없는 데이터
export function PageNotFound({ homeHref }: { homeHref: string }) {
  return (
    <div className="p-6">
      <EmptyState
        icon={<SearchXIcon />}
        title="찾을 수 없습니다"
        description="주소가 바뀌었거나, 지워졌거나, 볼 수 있는 범위 밖의 데이터입니다."
        action={
          <Button asChild variant="outline">
            <Link href={homeHref}>
              <HomeIcon />
              처음으로
            </Link>
          </Button>
        }
      />
    </div>
  )
}
