import type { NavArea } from '@/config/navigation'
import { findActiveHref } from './find-active-href'

export type BreadcrumbEntry = {
  label: string
  // 링크가 없으면 누를 수 없는 글자로 표시 (메뉴 묶음 이름, 현재 화면)
  href?: string
}

// 현재 주소에 맞는 경로를 메뉴 목록에서 찾는다: 영역(홈) › 묶음 › 메뉴
// 화면마다 경로를 따로 적지 않아도 되도록 메뉴 목록 한 곳만 보고 만든다
export function findBreadcrumb(pathname: string, area: NavArea): BreadcrumbEntry[] {
  const home: BreadcrumbEntry = { label: area.title, href: area.homeHref }
  const items = area.groups.flatMap((group) => group.items)
  const activeHref = findActiveHref(pathname, items)

  // 홈이거나 메뉴에 없는 주소면 영역 이름만 보여준다
  if (!activeHref || activeHref === area.homeHref) {
    return [{ label: area.title }]
  }

  const group = area.groups.find((g) => g.items.some((item) => item.href === activeHref))
  const item = group?.items.find((i) => i.href === activeHref)
  if (!group || !item) return [{ label: area.title }]

  const isCurrentPage = pathname === activeHref
  return [
    home,
    ...(group.label ? [{ label: group.label }] : []),
    // 메뉴의 하위 화면(예: 상세)이면 메뉴 이름을 링크로 둔다
    isCurrentPage ? { label: item.title } : { label: item.title, href: item.href },
  ]
}
