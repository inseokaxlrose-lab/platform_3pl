import { cn } from '@/lib/utils'

// 기준정보 등록·수정 화면은 MasterFormPage(@/components/master-form)를 쓴다 (docs/decisions/0031)
// 아래 부품은 그 밖의 작은 입력(팝업, 일괄 생성 같은 도구 화면)용

// 제목이 있는 입력 묶음: 카드 대신 위쪽 구분선으로 나눈다 (첫 묶음은 선 없음), 안의 칸은 위에서 아래로
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
    <section
      aria-label={title}
      className={cn('space-y-4 border-t pt-6 first:border-t-0 first:pt-0', className)}
    >
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
