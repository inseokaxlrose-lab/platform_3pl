// 사이드바 탭 (서버·브라우저 공용)
// 주의: 서버 부품(AppShell)이 'use client' 파일에서 값을 가져오면 실제 값 대신 "브라우저 부품 표시"가
// 들어온다. 그래서 서버도 읽는 쿠키 이름은 'use client'가 없는 이 파일에 둔다
export type SidebarTab = 'all' | 'favorites'

// 마지막으로 연 탭을 기억하는 쿠키 (서버가 처음부터 그 탭으로 그리도록)
export const SIDEBAR_TAB_COOKIE = 'sidebar_tab'
export const SIDEBAR_TAB_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// 쿠키 값 → 탭 (모르는 값이면 전체)
export function parseSidebarTab(value: string | undefined): SidebarTab {
  return value === 'favorites' ? 'favorites' : 'all'
}
