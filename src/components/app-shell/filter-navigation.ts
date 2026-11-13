import type { NavArea, NavGroup } from '@/config/navigation'
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

// 즐겨찾기 탭의 메뉴: 추가한 순서대로, 권한으로 거른 목록(area)에 있는 메뉴만
// (권한이 사라졌거나 목록에서 없어진 메뉴는 숨긴다. 기록은 DB에 남아 권한이 돌아오면 다시 보인다)
export function favoriteNavigation(area: NavArea, favorites: readonly string[]): NavGroup[] {
  const items = new Map(
    area.groups.flatMap((group) => group.items).map((item) => [item.href, item]),
  )
  const favoriteItems = favorites.flatMap((href) => items.get(href) ?? [])
  return favoriteItems.length > 0 ? [{ items: favoriteItems }] : []
}
