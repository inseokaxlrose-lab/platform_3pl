import { cn } from '@/lib/utils'

// 목록 그리드·하위 표가 함께 쓰는 툴바 배치 (docs/ui-guidelines.md "페이지 틀")
// 왼쪽: 제목·건수 등 / 오른쪽: 버튼 (추가·일괄 처리·엑셀·컬럼)
export function SectionToolbar({
  start,
  end,
  className,
}: {
  start?: React.ReactNode
  end?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">{start}</div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{end}</div>
    </div>
  )
}
