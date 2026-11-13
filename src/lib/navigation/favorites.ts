import 'server-only'
import { navigation } from '@/config/navigation'
import { prisma } from '@/lib/prisma'

// 즐겨찾기 최대 개수 (사이드바가 길어지지 않게)
export const MAX_FAVORITE_MENUS = 30

// 즐겨찾기할 수 있는 메뉴 주소: 메뉴 목록(src/config/navigation.ts)에 있는 주소만
const MENU_HREFS = new Set(
  Object.values(navigation).flatMap((area) =>
    area.groups.flatMap((group) => group.items.map((item) => item.href)),
  ),
)

export function isMenuHref(href: string) {
  return MENU_HREFS.has(href)
}

// 한 사용자의 즐겨찾기 메뉴 주소 (추가한 순서)
// 권한·영역 거르기는 화면(사이드바)에서 메뉴 목록과 맞춰 한다
export async function loadFavoriteMenus(userId: string): Promise<string[]> {
  const rows = await prisma.userFavoriteMenu.findMany({
    where: { userId },
    select: { href: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((row) => row.href)
}
