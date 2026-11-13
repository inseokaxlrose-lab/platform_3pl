import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: React.ReactNode
  // 오른쪽 버튼 자리 (등록, 엑셀 등)
  actions?: React.ReactNode
  className?: string
}

// 화면 상단 제목 영역: 모든 화면이 같은 모양으로 제목·설명·버튼을 보여준다
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
