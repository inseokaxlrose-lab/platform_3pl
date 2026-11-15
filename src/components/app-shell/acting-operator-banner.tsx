'use client'

import { LogOutIcon, ShieldAlertIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { exitActingOperatorAction } from '@/lib/platform/acting-actions'

// 플랫폼 관리자가 운영사로 전환해 작업 중일 때 화면 맨 위에 늘 보이는 띠 (0039)
// 지금 어느 운영사의 데이터를 바꾸는지 헷갈리지 않게 경고색으로 표시한다
export function ActingOperatorBanner({ name }: { name: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-page py-1.5 text-sm text-warning"
    >
      <ShieldAlertIcon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <strong className="font-semibold">{name}</strong> 운영사로 작업 중입니다. 바꾼 내용은 내
        아이디로 기록됩니다.
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await exitActingOperatorAction({})
            router.push('/platform/operators')
            router.refresh()
          })
        }
      >
        <LogOutIcon />
        나가기
      </Button>
    </div>
  )
}
