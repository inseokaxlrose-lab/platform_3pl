import { describe, expect, it } from 'vitest'
import { navigation } from './navigation'
import { isPermissionCode, PERMISSION_MENUS, type PermissionMenu } from './permissions'

// 메뉴 목록(navigation.ts)과 권한 목록(permissions.ts)이 서로 맞는지 검사한다
// 메뉴를 추가하고 권한을 빠뜨리거나, 권한만 있고 메뉴가 없으면 여기서 실패한다

const allItems = Object.entries(navigation).flatMap(([area, nav]) =>
  nav.groups.flatMap((group) => group.items.map((item) => ({ area, ...item }))),
)

// 'inbound.asn.create' → 'inbound.asn'
const menuOf = (code: string) => code.slice(0, code.lastIndexOf('.')) as PermissionMenu

describe('메뉴 ↔ 권한 일관성', () => {
  it('홈을 제외한 모든 메뉴에 필요 권한이 있고, 그 코드는 권한 목록에 있다', () => {
    for (const item of allItems) {
      if (item.href === navigation[item.area as 'admin' | 'portal'].homeHref) {
        expect(item.permission, item.href).toBeUndefined()
        continue
      }
      expect(item.permission, item.href).toBeDefined()
      expect(isPermissionCode(item.permission!), item.href).toBe(true)
    }
  })

  it('메뉴 접근 권한은 조회(read) 또는 등록 메뉴의 등록(create)이다', () => {
    for (const item of allItems.filter((i) => i.permission)) {
      expect(item.permission, item.href).toMatch(/\.(read|create)$/)
    }
  })

  it('메뉴의 권한은 같은 영역(운영사 화면/포털)의 권한이다', () => {
    for (const item of allItems.filter((i) => i.permission)) {
      expect(PERMISSION_MENUS[menuOf(item.permission!)].area, item.href).toBe(item.area)
    }
  })

  it('권한 목록의 모든 메뉴가 사이드바 메뉴에 있다', () => {
    const usedMenus = new Set(
      allItems.filter((i) => i.permission).map((i) => menuOf(i.permission!)),
    )
    for (const menu of Object.keys(PERMISSION_MENUS)) {
      expect(usedMenus.has(menu as PermissionMenu), menu).toBe(true)
    }
  })
})
