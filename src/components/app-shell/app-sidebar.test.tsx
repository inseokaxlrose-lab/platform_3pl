import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionProvider } from '@/components/permission'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PermissionCode } from '@/config/permissions'
import { AppSidebar, type SidebarTab } from './app-sidebar'

// jsdom에는 matchMedia가 없다: 사이드바의 모바일 판단용으로 "데스크톱 화면"이라고 답하게 채운다
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push }),
}))

// 품목·재고 이력·사용자 권한 (품목 등은 아직 "준비 중"일 수 있어 화면이 만들어진 사용자 메뉴로 이동 확인)
const CODES: PermissionCode[] = ['master.items.read', 'stock.history.read', 'system.users.read']

function renderSidebar({
  favorites = [],
  initialTab = 'all',
  onToggleFavorite = vi.fn(async () => ({ ok: true as const, data: null })),
}: {
  favorites?: string[]
  initialTab?: SidebarTab
  onToggleFavorite?: Parameters<typeof AppSidebar>[0]['onToggleFavorite']
} = {}) {
  render(
    <PermissionProvider codes={CODES}>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar
            area="admin"
            favorites={favorites}
            initialTab={initialTab}
            onToggleFavorite={onToggleFavorite}
          />
        </SidebarProvider>
      </TooltipProvider>
    </PermissionProvider>,
  )
  return { onToggleFavorite }
}

const search = () => screen.getByRole('searchbox', { name: '메뉴 검색' })
// 본문(메뉴 목록)의 메뉴 이름만 (머리말의 '3PL 플랫폼' 줄 제외)
const menuTitles = () =>
  [...document.querySelectorAll('[data-sidebar="content"] li')]
    .map((li) => li.querySelector('[data-sidebar="menu-button"] span')?.textContent)
    .filter(Boolean)

beforeEach(() => {
  push.mockClear()
  document.cookie = 'sidebar_tab=; max-age=0; path=/'
})

describe('사이드바 메뉴 검색', () => {
  it('초성으로 찾고, 탭은 숨긴다', () => {
    renderSidebar()
    fireEvent.change(search(), { target: { value: 'ㅅㅇㅈ' } })

    expect(menuTitles()).toEqual(['사용자'])
    expect(screen.queryByRole('tab', { name: '전체' })).toBeNull()
  })

  it('Enter로 첫 결과로 이동하고 검색어를 지운다', () => {
    renderSidebar()
    fireEvent.change(search(), { target: { value: '사용' } })
    fireEvent.keyDown(search(), { key: 'Enter' })

    expect(push).toHaveBeenCalledWith('/admin/system/users')
    expect(search()).toHaveProperty('value', '')
  })

  it('맞는 메뉴가 없으면 안내하고, Esc로 검색어를 지운다', () => {
    renderSidebar()
    fireEvent.change(search(), { target: { value: '없는메뉴' } })
    expect(screen.getByText("'없는메뉴'와 일치하는 메뉴가 없습니다.")).toBeTruthy()

    fireEvent.keyDown(search(), { key: 'Escape' })
    expect(search()).toHaveProperty('value', '')
    expect(menuTitles()).toContain('사용자')
  })

  it('⌘K / Ctrl+K로 검색칸에 초점이 간다', async () => {
    vi.useFakeTimers()
    renderSidebar()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await act(async () => vi.runAllTimers())
    expect(document.activeElement).toBe(search())
    vi.useRealTimers()
  })
})

describe('사이드바 즐겨찾기', () => {
  it('별을 누르면 바로 즐겨찾기에 들어가고, 즐겨찾기 탭에 보인다 (탭은 쿠키에 기억)', async () => {
    const { onToggleFavorite } = renderSidebar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '사용자 즐겨찾기 추가' }))
    })

    expect(onToggleFavorite).toHaveBeenCalledWith({ href: '/admin/system/users', favorite: true })
    expect(screen.getByRole('button', { name: '사용자 즐겨찾기 해제' })).toBeTruthy()

    fireEvent.mouseDown(screen.getByRole('tab', { name: '즐겨찾기' }))
    expect(menuTitles()).toEqual(['사용자'])
    expect(document.cookie).toContain('sidebar_tab=favorites')
  })

  it('저장에 실패하면 원래대로 되돌리고 이유를 보여준다', async () => {
    renderSidebar({
      onToggleFavorite: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'CONFLICT' as const, message: '즐겨찾기는 30개까지 추가할 수 있습니다.' },
      })),
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '사용자 즐겨찾기 추가' }))
    })

    expect(screen.getByRole('button', { name: '사용자 즐겨찾기 추가' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('30개까지')
  })

  it('즐겨찾기 탭: 권한 있는 메뉴만 추가한 순서로, 없으면 안내', () => {
    renderSidebar({
      initialTab: 'favorites',
      favorites: ['/admin/system/users', '/admin/system/roles' /* 권한 없음 */],
    })
    expect(menuTitles()).toEqual(['사용자'])
    expect(
      within(screen.getByRole('tablist')).getByRole('tab', { name: '즐겨찾기' }),
    ).toHaveProperty('ariaSelected', 'true')
  })

  it('즐겨찾기가 비어 있으면 추가 방법을 안내한다', () => {
    renderSidebar({ initialTab: 'favorites' })
    expect(screen.getByText(/메뉴 옆 ☆를 눌러 추가하세요/)).toBeTruthy()
  })
})
