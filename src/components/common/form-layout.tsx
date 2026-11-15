import { cn } from '@/lib/utils'

// 기준정보 등록·수정 화면은 MasterFormPage(@/components/master-form)를 쓴다 (docs/decisions/0031)
// FormSection은 그 밖의 도구 화면(로케이션 일괄 생성 등)의 묶음용. 칸 배치는 FormGrid·Field (팝업 포함)

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
