import { HelpButton } from '@/components/help'
import { cn } from '@/lib/utils'

export type PageHeaderProps = {
  title: string
  // 화면 설명 (한 줄)
  description?: React.ReactNode
  // 설명 다음 줄: 마지막 수정 정보·상태 배지 등
  meta?: React.ReactNode
  // 오른쪽 버튼: 보조 버튼들 → 주 버튼 순서로 넘긴다. [도움말]은 그 뒤 맨 오른쪽 끝에 자동
  actions?: React.ReactNode
  className?: string
}

// 화면 상단 제목 영역 (docs/ui-guidelines.md "페이지 틀")
// 버튼 순서 고정: 보조 → 주 → [도움말](맨 오른쪽 끝, 모든 화면에서 같은 자리). [도움말]은 그 화면 메뉴의 도움말 파일이 있으면 자동으로 나온다 (0023)
// 보통 AppPage가 그린다 (화면에서 직접 쓰지 않는다)
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {meta && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <HelpButton />
      </div>
    </div>
  )
}
