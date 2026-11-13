'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

// 여러 개 고르기 (센터, 권한그룹)
export function CheckboxList({
  name,
  options,
  value,
  onChange,
  disabled,
  emptyText,
}: {
  name: string
  options: { id: string; label: string }[]
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  emptyText: string
}) {
  if (options.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>
  return (
    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
      {options.map((option) => {
        const id = `${name}-${option.id}`
        return (
          <div key={option.id} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={value.includes(option.id)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...value, option.id] : value.filter((v) => v !== option.id))
              }
              disabled={disabled}
            />
            <Label htmlFor={id} className="font-normal">
              {option.label}
            </Label>
          </div>
        )
      })}
    </div>
  )
}
