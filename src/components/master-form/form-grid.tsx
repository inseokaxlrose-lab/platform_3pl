import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// 12칸 격자: 칸 너비는 Field의 span으로 정한다 (docs/ui-guidelines.md "필드별 기본 span")
// 좁은 화면(md 미만)에서는 모든 칸이 한 줄 전체
// 줄 간격(gap-y-3)은 원래보다 좁다: Field마다 아래에 안내 한 줄 자리가 늘 있어서 그 자리도 간격 역할을 한다
export function FormGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 items-start gap-x-4 gap-y-3 md:grid-cols-12', className)}>
      {children}
    </div>
  )
}

export type FieldSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

// Tailwind가 찾을 수 있게 클래스 이름을 글자 그대로 적어 둔다
const SPAN_CLASS: Record<FieldSpan, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-7',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  10: 'md:col-span-10',
  11: 'md:col-span-11',
  12: 'md:col-span-12',
}

export type FieldProps = {
  label: string
  // 12칸 중 몇 칸 (기본 4)
  span?: FieldSpan
  required?: boolean
  error?: string
  // 칸 아래 작은 안내 (오류가 있으면 오류가 대신 보인다)
  hint?: React.ReactNode
  // 이름표를 누르면 초점이 갈 입력 id
  htmlFor?: string
  // true면 앞 칸에 이어 붙이지 않고 새 줄 첫 칸에서 시작 (줄바꿈용 빈 칸을 넣지 않는다)
  newRow?: boolean
  className?: string
  children: React.ReactNode
}

// 입력 칸 하나: 이름표(위) + 입력 + 오류/안내 (FormGrid 안에서 쓴다)
export function Field({
  label,
  span = 4,
  required,
  error,
  hint,
  htmlFor,
  newRow,
  className,
  children,
}: FieldProps) {
  return (
    <div
      className={cn(
        'grid min-w-0 content-start gap-2',
        SPAN_CLASS[span],
        newRow && 'md:col-start-1',
        className,
      )}
    >
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {/* 안내·오류 자리: 없어도 한 줄을 늘 잡아 둔다 → 안내가 있는 칸과 없는 칸의 줄 간격이 같다 */}
      {error ? (
        <p role="alert" className="-mt-1 min-h-4 text-xs leading-4 text-destructive">
          {error}
        </p>
      ) : (
        <p className="-mt-1 min-h-4 text-xs leading-4 text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
