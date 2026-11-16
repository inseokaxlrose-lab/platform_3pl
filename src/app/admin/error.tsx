'use client'

import { PageError } from '@/components/common/page-states'

// 운영사 화면: 화면을 그리다 오류가 나면 (0066) — 사이드바는 그대로 두고 본문만 바꾼다
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <PageError error={error} reset={reset} homeHref="/admin" />
}
