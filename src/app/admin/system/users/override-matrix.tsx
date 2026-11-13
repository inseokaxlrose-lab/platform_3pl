'use client'

import { CheckIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { groupedMenus, PERMISSION_ACTIONS } from '@/components/permission/permission-matrix'
import {
  PERMISSION_ACTION_LABELS,
  PERMISSION_MENUS,
  type PermissionArea,
  type PermissionCode,
} from '@/config/permissions'
import {
  nextOverrideState,
  overrideStateOf,
  setOverrideState,
  type OverrideState,
  type Overrides,
} from '@/lib/permissions/override-state'
import { cn } from '@/lib/utils'

type OverrideMatrixProps = {
  area: PermissionArea
  // 운영사 사용자만 시스템 메뉴 줄이 나온다
  includeOperatorOnly: boolean
  // 저장된 그룹 권한 (그룹대로일 때 회색 ✓로 보여줌)
  groupCodes: readonly PermissionCode[]
  value: Overrides
  onChange: (value: Overrides) => void
  disabled?: boolean
}

// 칸 상태별 설명 (마우스를 올리면 보이는 글자 + 화면 읽기 프로그램용)
function describe(state: OverrideState, inGroup: boolean) {
  if (state === 'grant') return '추가'
  if (state === 'deny') return '제외'
  return inGroup ? '그룹대로 (있음)' : '그룹대로 (없음)'
}

// 사용자별 추가·제외 권한 표: 칸을 누를 때마다 그룹대로 → ＋추가 → −제외 → 그룹대로
export function OverrideMatrix({
  area,
  includeOperatorOnly,
  groupCodes,
  value,
  onChange,
  disabled,
}: OverrideMatrixProps) {
  const inGroup = new Set(groupCodes)
  const gridColumns = {
    gridTemplateColumns: `minmax(8rem, 1.5fr) repeat(${PERMISSION_ACTIONS.length}, minmax(3.5rem, 1fr))`,
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card text-sm">
      <div className="min-w-[40rem]">
        {/* 제목 줄 */}
        <div
          className="grid items-center border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"
          style={gridColumns}
        >
          <span>메뉴</span>
          {PERMISSION_ACTIONS.map((action) => (
            <span key={action} className="text-center">
              {PERMISSION_ACTION_LABELS[action]}
            </span>
          ))}
        </div>

        {groupedMenus(area, includeOperatorOnly).map(([group, menus]) => (
          <div key={group} role="group" aria-label={group}>
            <div className="border-b bg-muted/20 px-3 py-1.5 text-xs font-semibold">{group}</div>

            {menus.map((menu) => {
              const definition = PERMISSION_MENUS[menu]
              return (
                <div
                  key={menu}
                  className="grid items-center border-b px-3 py-1 last:border-b-0 hover:bg-muted/30"
                  style={gridColumns}
                >
                  <span className="pl-3">{definition.label}</span>
                  {PERMISSION_ACTIONS.map((action) => {
                    const available = (definition.actions as readonly string[]).includes(action)
                    if (!available) {
                      return (
                        <span key={action} className="text-center text-muted-foreground/40">
                          ·
                        </span>
                      )
                    }
                    const code = `${menu}.${action}` as PermissionCode
                    const state = overrideStateOf(value, code)
                    const label = describe(state, inGroup.has(code))
                    return (
                      <span key={action} className="flex justify-center">
                        <button
                          type="button"
                          aria-label={`${definition.label} ${PERMISSION_ACTION_LABELS[action]}: ${label}`}
                          title={label}
                          data-state={state}
                          disabled={disabled}
                          onClick={() =>
                            onChange(setOverrideState(value, code, nextOverrideState(state)))
                          }
                          className={cn(
                            // 작은 네모 버튼: 상태에 따라 색과 아이콘이 바뀐다
                            'flex size-6 items-center justify-center rounded-md border transition-colors',
                            'outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                            state === 'inherit' && 'border-border text-muted-foreground',
                            state === 'grant' && 'border-success bg-success/15 text-success',
                            state === 'deny' &&
                              'border-destructive bg-destructive/15 text-destructive',
                          )}
                        >
                          {state === 'grant' && <PlusIcon className="size-4" />}
                          {state === 'deny' && <MinusIcon className="size-4" />}
                          {state === 'inherit' && inGroup.has(code) && (
                            <CheckIcon className="size-3.5" />
                          )}
                        </button>
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
