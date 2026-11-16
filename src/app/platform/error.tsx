'use client'

import { PageError } from '@/components/common/page-states'

// 플랫폼 화면: 화면을 그리다 오류가 나면 (0066)
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <PageError error={error} reset={reset} homeHref="/platform" />
}
