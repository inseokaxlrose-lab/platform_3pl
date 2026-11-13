import { cn } from '@/lib/utils'

// 입력 화면 공통 배치 (docs/decisions/0002 "입력 화면")
// 책을 펼친 모양: 왼쪽 단에 다 담을 수 있으면 왼쪽만, 넘칠 만큼 많을 때만 오른쪽 단으로 이어서 쓴다
// - 단 안에서는 위에서 아래로 쌓는다. 관련 있는 짧은 칸은 FormRow로 한 줄에 2개까지
// - 넓은 화면(lg 이상)에서만 2단, 그보다 좁으면 1단으로 위아래로 이어진다
// - 표처럼 넓어야 하는 내용(권한 체크 표 등)은 FormColumns 밖에 전체 너비로 둔다
export function FormColumns({
  left,
  right,
  className,
}: {
  left: React.ReactNode
  // 없으면 왼쪽 단만 쓰고 오른쪽은 비워 둔다
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid items-start gap-6 lg:grid-cols-2', className)}>
      <div data-column="left" className="grid gap-6">
        {left}
      </div>
      {right && (
        <div data-column="right" className="grid gap-6">
          {right}
        </div>
      )}
    </div>
  )
}

// 제목이 있는 입력 묶음 상자 (기본 정보, 연락처 등): 안의 칸은 위에서 아래로 쌓인다
export function FormSection({
  title,
  required,
  description,
  action,
  className,
  children,
}: {
  title: string
  // 제목 옆 필수 표시(*)
  required?: boolean
  description?: React.ReactNode
  // 제목 오른쪽 버튼 (예: 담당자 추가)
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} className={cn('space-y-4 rounded-lg border p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            {title}
            {required && <span className="text-destructive"> *</span>}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  )
}

// 한 줄에 칸 2개까지: 관련 있는 짧은 정보만 묶는다 (예: 업태 / 종목, 비밀번호 / 비밀번호 확인)
// 좁은 화면에서는 한 줄에 하나로 바뀐다
export function FormRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('grid items-start gap-4 sm:grid-cols-2', className)}>{children}</div>
}
