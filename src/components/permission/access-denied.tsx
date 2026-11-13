import { HouseIcon, ShieldXIcon } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/common'
import { Button } from '@/components/ui/button'

// 권한 없는 화면에 들어왔을 때 보여주는 안내
// ('/'는 사용자 유형별 홈으로 자동 이동한다)
export function AccessDenied() {
  return (
    <EmptyState
      icon={<ShieldXIcon />}
      title="접근 권한이 없습니다"
      description="이 화면을 사용하려면 권한이 필요합니다. 필요하면 관리자에게 권한을 요청하세요."
      action={
        <Button asChild variant="outline">
          <Link href="/">
            <HouseIcon />
            홈으로
          </Link>
        </Button>
      }
    />
  )
}
