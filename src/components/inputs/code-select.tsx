'use client'

import { useCodeOptions } from '@/components/common-code'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { selectableCodes } from '@/lib/common-code'
import { cn } from '@/lib/utils'

// 고르기 목록에서 "선택 안 함"을 나타내는 값 (Radix Select는 빈 글자를 값으로 못 쓴다)
const NONE = '__none__'

// 공통코드 고르기 (docs/decisions/0030): 그룹만 넘기면 공통코드 공급자에서 목록을 꺼낸다
// - 사용 중지된 코드는 숨기되, 지금 저장된 값이면 "(사용 중지)"를 붙여 보여준다
// - 값은 코드 글자 (예: 'INBOUND'), 비어 있으면 ''
export function CodeSelect({
  group,
  value,
  onChange,
  id,
  placeholder = '선택',
  disabled,
  invalid,
  allowEmpty = false,
  className,
}: {
  group: string
  value: string
  onChange: (code: string) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  // true면 맨 위에 "선택 안 함"을 두어 값을 비울 수 있다
  allowEmpty?: boolean
  className?: string
}) {
  const options = selectableCodes(useCodeOptions(group), value)
  return (
    <Select
      value={value || (allowEmpty ? NONE : '')}
      onValueChange={(next) => onChange(next === NONE ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-invalid={invalid} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value={NONE}>선택 안 함</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.code} value={option.code}>
            {option.name}
            {!option.isActive && <span className="text-muted-foreground"> (사용 중지)</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
