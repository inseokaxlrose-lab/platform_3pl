// 메뉴 탭 계산 (docs/decisions/0069) — 화면과 떼어 둔 순수 함수
// - 탭 하나 = 메뉴 하나 (href: 메뉴 주소), url: 그 메뉴에서 마지막으로 보던 주소 (검색 조건·하위 화면 포함)
// - 홈은 탭 목록에 넣지 않는다 (늘 맨 앞에 따로 그린다)

export type MenuTab = {
  href: string
  url: string
  // 마지막으로 연 순서 (최대 개수를 넘으면 가장 오래 안 쓴 탭부터 닫는다)
  usedAt: number
}

export const MAX_MENU_TABS = 10

// 메뉴를 열었다: 없으면 맨 끝에 추가, 있으면 자리는 그대로 두고 주소·사용 순서만 바꾼다
export function openMenuTab(
  tabs: readonly MenuTab[],
  href: string,
  url: string,
  usedAt: number,
  max = MAX_MENU_TABS,
): MenuTab[] {
  const exists = tabs.some((tab) => tab.href === href)
  const next = exists
    ? tabs.map((tab) => (tab.href === href ? { href, url, usedAt } : tab))
    : [...tabs, { href, url, usedAt }]
  if (next.length <= max) return next
  // 넘치면 방금 연 탭을 뺀 나머지 중 가장 오래 안 쓴 탭부터
  const drop = new Set(
    next
      .filter((tab) => tab.href !== href)
      .sort((a, b) => a.usedAt - b.usedAt)
      .slice(0, next.length - max)
      .map((tab) => tab.href),
  )
  return next.filter((tab) => !drop.has(tab.href))
}

// 탭 닫기: 닫은 뒤 목록과, 닫은 탭 다음에 갈 탭 (오른쪽 → 없으면 왼쪽 → 없으면 null = 홈)
export function closeMenuTab(
  tabs: readonly MenuTab[],
  href: string,
): { tabs: MenuTab[]; next: MenuTab | null } {
  const index = tabs.findIndex((tab) => tab.href === href)
  if (index < 0) return { tabs: [...tabs], next: null }
  const rest = tabs.filter((tab) => tab.href !== href)
  return { tabs: rest, next: rest[index] ?? rest[index - 1] ?? null }
}

// 전체 닫기: keep으로 준 탭(보던 탭)만 남긴다. keep이 없으면 모두 닫는다
// 보던 탭은 홈으로 옮겨 간 뒤에 닫는다 (변경 중 확인 창에서 [계속 작성]이면 남는다)
export function closeAllMenuTabs(tabs: readonly MenuTab[], keep: string | null): MenuTab[] {
  return tabs.filter((tab) => tab.href === keep)
}

// 저장해 둔 글자를 탭 목록으로 (모양이 틀리면 빈 목록)
export function parseMenuTabs(raw: string | null): MenuTab[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter(
      (tab): tab is MenuTab =>
        typeof tab === 'object' &&
        tab !== null &&
        typeof tab.href === 'string' &&
        typeof tab.url === 'string' &&
        typeof tab.usedAt === 'number' &&
        // 다른 사이트 주소가 섞여 들어오지 않게: 우리 화면 주소만
        tab.url.startsWith(tab.href),
    )
  } catch {
    return []
  }
}
