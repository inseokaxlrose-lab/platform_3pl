import type { NavArea } from '@/config/navigation'
import type { PermissionCode } from '@/config/permissions'

// 권한으로 메뉴 걸러내기
// - 필요 권한(permission)이 없는 메뉴(홈)는 항상 보인다
// - 권한이 없는 메뉴는 "준비 중"이어도 숨긴다
// - 메뉴가 하나도 남지 않은 묶음은 묶음 제목까지 숨긴다
export function filterNavigation(area: NavArea, codes: ReadonlySet<PermissionCode>): NavArea {
  return {
    ...area,
    groups: area.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.permission || codes.has(item.permission)),
      }))
      .filter((group) => group.items.length > 0),
  }
}
