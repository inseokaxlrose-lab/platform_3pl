'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

// 상속 칸 (0073, docs/ui-guidelines.md "상속 칸"): 위 단계(운영사 등) 값을 그대로 쓰거나, 이 단계에서 따로 정한다
// - inherited = true  → 입력 부품 대신 "운영사 값: 17:00"을 보여 주고, 저장 값은 비운다(NULL = 위 단계 값)
// - inherited = false → children(입력 부품)으로 이 단계 값을 입력한다
// 체크를 풀면 onInheritedChange(false) — 보통 위 단계 값을 시작값으로 채워 준다
export function InheritableField({
  id,
  parentLabel,
  parentValue,
  inherited,
  onInheritedChange,
  disabled,
  children,
}: {
  id: string
  // 위 단계 이름 (예: '운영사')
  parentLabel: string
  // 위 단계 값을 화면에 보일 글자 ('' = 위 단계도 정하지 않음)
  parentValue: string
  inherited: boolean
  onInheritedChange: (inherited: boolean) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  const checkId = `${id}-inherit`
  return (
    <div className="grid gap-1.5">
      {inherited ? (
        <div
          id={id}
          className="flex h-9 items-center rounded-md border border-dashed bg-muted/40 px-3 text-sm text-muted-foreground"
        >
          {parentLabel} 값: {parentValue || '정하지 않음'}
        </div>
      ) : (
        children
      )}
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkId}
          checked={inherited}
          onCheckedChange={(checked) => onInheritedChange(checked === true)}
          disabled={disabled}
        />
        <Label htmlFor={checkId} className="text-xs font-normal text-muted-foreground">
          {parentLabel} 값 사용
        </Label>
      </div>
    </div>
  )
}
