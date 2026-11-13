'use client'

import { Checkbox } from '@/components/ui/checkbox'
import {
  PERMISSION_ACTION_LABELS,
  PERMISSION_MENUS,
  type PermissionAction,
  type PermissionArea,
  type PermissionCode,
  type PermissionMenu,
} from '@/config/permissions'
import { isOperatorOnly } from '@/lib/permissions/compute-permissions'
import { cn } from '@/lib/utils'
import { menusCheckState, toggleMenus, togglePermission } from '@/lib/permissions/permission-toggle'

export const PERMISSION_ACTIONS = Object.keys(PERMISSION_ACTION_LABELS) as PermissionAction[]
const ACTIONS = PERMISSION_ACTIONS

type PermissionMatrixProps = {
  area: PermissionArea
  value: readonly PermissionCode[]
  onChange: (codes: PermissionCode[]) => void
  disabled?: boolean
  // false면 운영사 전용 메뉴(시스템) 줄을 숨긴다 (센터 직원의 권한 미리보기 등)
  includeOperatorOnly?: boolean
}

// 영역의 메뉴를 묶음(기준정보·입고 등)별로
export function groupedMenus(area: PermissionArea, includeOperatorOnly = true) {
  const groups = new Map<string, PermissionMenu[]>()
  for (const [menu, definition] of Object.entries(PERMISSION_MENUS)) {
    if (definition.area !== area) continue
    if (!includeOperatorOnly && isOperatorOnly(`${menu}.read` as PermissionCode)) continue
    groups.set(definition.group, [...(groups.get(definition.group) ?? []), menu as PermissionMenu])
  }
  return [...groups.entries()]
}

// 권한 체크 표: 메뉴(줄) × 동작(칸). 그 메뉴에 있는 동작만 체크박스가 나온다
// 버튼 권한을 체크하면 조회도 체크, 조회를 해제하면 줄 전체 해제 (permission-toggle.ts)
export function PermissionMatrix({
  area,
  value,
  onChange,
  disabled,
  includeOperatorOnly = true,
}: PermissionMatrixProps) {
  const selected = new Set(value)
  const gridColumns = {
    gridTemplateColumns: `minmax(8rem, 1.5fr) repeat(${ACTIONS.length + 1}, minmax(3.5rem, 1fr))`,
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card text-sm">
      <div className="min-w-[44rem]">
        {/* 제목 줄 */}
        <div
          className="grid items-center border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"
          style={gridColumns}
        >
          <span>메뉴</span>
          <span className="text-center">전체</span>
          {ACTIONS.map((action) => (
            <span key={action} className="text-center">
              {PERMISSION_ACTION_LABELS[action]}
            </span>
          ))}
        </div>

        {groupedMenus(area, includeOperatorOnly).map(([group, menus]) => (
          <div key={group} role="group" aria-label={group}>
            {/* 묶음 줄: 묶음 전체 체크 */}
            <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1.5">
              <Checkbox
                aria-label={`${group} 전체`}
                checked={menusCheckState(value, menus)}
                onCheckedChange={(checked) => onChange(toggleMenus(value, menus, checked === true))}
                disabled={disabled}
              />
              <span className="text-xs font-semibold">{group}</span>
            </div>

            {menus.map((menu) => {
              const definition = PERMISSION_MENUS[menu]
              return (
                <div
                  key={menu}
                  className="grid items-center border-b px-3 py-1.5 last:border-b-0 hover:bg-muted/30"
                  style={gridColumns}
                >
                  <span className="pl-6">{definition.label}</span>
                  <span className="flex justify-center">
                    <Checkbox
                      aria-label={`${definition.label} 전체`}
                      checked={menusCheckState(value, [menu])}
                      onCheckedChange={(checked) =>
                        onChange(toggleMenus(value, [menu], checked === true))
                      }
                      disabled={disabled}
                    />
                  </span>
                  {ACTIONS.map((action) => {
                    const available = (definition.actions as readonly string[]).includes(action)
                    const code = `${menu}.${action}` as PermissionCode
                    return (
                      <span
                        key={action}
                        className={cn(
                          'flex justify-center',
                          !available && 'text-muted-foreground/40',
                        )}
                      >
                        {available ? (
                          <Checkbox
                            aria-label={`${definition.label} ${PERMISSION_ACTION_LABELS[action]}`}
                            checked={selected.has(code)}
                            onCheckedChange={(checked) =>
                              onChange(togglePermission(value, menu, action, checked === true))
                            }
                            disabled={disabled}
                          />
                        ) : (
                          '·'
                        )}
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
