import {
  PERMISSION_MENUS,
  type PermissionAction,
  type PermissionCode,
  type PermissionMenu,
} from '@/config/permissions'

// 권한 체크 표의 체크 규칙 (0013: 조회 권한이 없으면 버튼 권한도 무효)
// 모두 새 배열을 돌려준다 (원래 값은 바꾸지 않음)

const code = (menu: PermissionMenu, action: PermissionAction) =>
  `${menu}.${action}` as PermissionCode
const menuCodes = (menu: PermissionMenu) =>
  PERMISSION_MENUS[menu].actions.map((action) => code(menu, action as PermissionAction))

// 한 칸 체크/해제
// - 버튼 권한 체크 → 조회도 체크
// - 조회 해제 → 그 메뉴 전체 해제
export function togglePermission(
  codes: readonly PermissionCode[],
  menu: PermissionMenu,
  action: PermissionAction,
  checked: boolean,
): PermissionCode[] {
  const set = new Set(codes)
  if (checked) {
    set.add(code(menu, action))
    set.add(code(menu, 'read'))
  } else if (action === 'read') {
    for (const c of menuCodes(menu)) set.delete(c)
  } else {
    set.delete(code(menu, action))
  }
  return [...set]
}

// 여러 메뉴의 모든 동작을 한꺼번에 체크/해제 (줄 전체, 묶음 전체)
export function toggleMenus(
  codes: readonly PermissionCode[],
  menus: readonly PermissionMenu[],
  checked: boolean,
): PermissionCode[] {
  const set = new Set(codes)
  for (const menu of menus) {
    for (const c of menuCodes(menu)) {
      if (checked) set.add(c)
      else set.delete(c)
    }
  }
  return [...set]
}

// 여러 메뉴의 체크 상태: 전부 / 일부 / 없음
export function menusCheckState(
  codes: readonly PermissionCode[],
  menus: readonly PermissionMenu[],
): boolean | 'indeterminate' {
  const all = menus.flatMap(menuCodes)
  const set = new Set(codes)
  const count = all.filter((c) => set.has(c)).length
  if (count === 0) return false
  return count === all.length ? true : 'indeterminate'
}
