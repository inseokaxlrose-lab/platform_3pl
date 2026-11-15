'use client'

import { Switch } from '@/components/ui/switch'

// 예/아니오 스위치 (권장 span 2~3). 값은 boolean — DB도 Boolean으로 저장한다 ('Y'/'N' 글자를 쓰지 않는다)
export function YnToggle({
  value,
  onChange,
  id,
  disabled,
  onLabel = '사용',
  offLabel = '미사용',
}: {
  value: boolean
  onChange: (value: boolean) => void
  id?: string
  disabled?: boolean
  onLabel?: string
  offLabel?: string
}) {
  return (
    <div className="flex h-9 items-center gap-2">
      <Switch id={id} checked={value} onCheckedChange={onChange} disabled={disabled} />
      <span className="text-sm text-muted-foreground" aria-hidden>
        {value ? onLabel : offLabel}
      </span>
    </div>
  )
}
