'use client'

import { codeName } from '@/lib/common-code'
import { useCodeOptions } from './common-code-provider'

// 사유 표시 (0087): 사유 코드 이름 — 메모. 코드가 없던 예전 줄은 메모만 보인다
export function ReasonText({
  group,
  code,
  memo,
}: {
  group: string
  code: string | null
  memo?: string | null
}) {
  const name = codeName(useCodeOptions(group), code)
  const text = [name, memo].filter(Boolean).join(' — ')
  return <>{text || '-'}</>
}
