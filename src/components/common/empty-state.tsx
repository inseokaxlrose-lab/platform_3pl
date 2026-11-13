import { InboxIcon } from 'lucide-react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

type EmptyStateProps = {
  title: string
  description?: React.ReactNode
  // 아이콘 요소 (예: <PackageIcon />). 없으면 기본 아이콘
  icon?: React.ReactNode
  // 다음 행동 버튼 (예: 등록 버튼)
  action?: React.ReactNode
  className?: string
}

// 빈 상태: 보여줄 데이터가 없을 때 이유와 다음 행동을 안내한다 (그리드 빈 상태에도 사용)
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon ?? <InboxIcon />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
