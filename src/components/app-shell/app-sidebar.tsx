'use client'

import { SearchIcon, WarehouseIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { usePermission } from '@/components/permission'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { navigation, type NavAreaKey } from '@/config/navigation'
import type { ActionResult } from '@/lib/actions/result'
import { favoriteNavigation, filterNavigation } from './filter-navigation'
import { findActiveHref } from './find-active-href'
import { searchNavigation } from './search-navigation'
import { SidebarNavList } from './sidebar-nav-list'
import { SIDEBAR_TAB_COOKIE, SIDEBAR_TAB_COOKIE_MAX_AGE, type SidebarTab } from './sidebar-tab'

type AppSidebarProps = {
  area: NavAreaKey
  // 즐겨찾기 메뉴 주소 (추가한 순서)
  favorites: string[]
  initialTab: SidebarTab
  // 즐겨찾기 켜기/끄기 서버 액션 (레이아웃이 넘겨준다 → 이 부품은 서버 코드를 직접 부르지 않음)
  onToggleFavorite: (input: { href: string; favorite: boolean }) => Promise<ActionResult<unknown>>
}

// 왼쪽 메뉴 사이드바: 메뉴 검색 + [전체 / 즐겨찾기] 탭 (docs/decisions/0022)
// 아이콘(함수)은 서버→브라우저로 전달할 수 없으므로, 영역 이름(area)만 받아 메뉴 목록을 직접 불러온다
export function AppSidebar({
  area,
  favorites: initialFavorites,
  initialTab,
  onToggleFavorite,
}: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { codes } = usePermission()
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar()
  const searchInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<SidebarTab>(initialTab)
  const [favorites, setFavorites] = useState(initialFavorites)
  const [favoriteError, setFavoriteError] = useState<string | null>(null)

  // 권한 없는 메뉴·빈 묶음은 숨긴다
  const allowed = filterNavigation(navigation[area], codes)
  const activeHref = findActiveHref(
    pathname,
    allowed.groups.flatMap((group) => group.items),
  )
  const searching = query.trim().length > 0
  const searchResult = searchNavigation(allowed, query)
  const favoriteGroups = favoriteNavigation(allowed, favorites)
  const favoriteSet = new Set(favorites)

  // ⌘K / Ctrl+K: 검색칸으로 (사이드바가 접혀 있으면 펼친 뒤)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      if (isMobile) setOpenMobile(true)
      else if (state === 'collapsed') setOpen(true)
      // 펼쳐지는 동안 기다렸다가 초점 이동
      setTimeout(() => searchInput.current?.focus(), 0)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMobile, state, setOpen, setOpenMobile])

  function changeTab(next: SidebarTab) {
    setTab(next)
    document.cookie = `${SIDEBAR_TAB_COOKIE}=${next}; path=/; max-age=${SIDEBAR_TAB_COOKIE_MAX_AGE}`
  }

  // 즐겨찾기: 화면을 먼저 바꾸고 저장, 실패하면 되돌린다
  async function toggleFavorite(href: string, favorite: boolean) {
    const previous = favorites
    setFavoriteError(null)
    setFavorites(
      favorite ? [...previous.filter((h) => h !== href), href] : previous.filter((h) => h !== href),
    )
    const result = await onToggleFavorite({ href, favorite })
    if (!result.ok) {
      setFavorites(previous)
      setFavoriteError(result.error.message)
    }
  }

  // Enter: 첫 번째 결과(열 수 있는 메뉴)로 이동 / Esc: 검색어 지우기
  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      const first = searchResult.groups.flatMap((g) => g.items).find((item) => item.ready)
      if (!first) return
      event.preventDefault()
      setQuery('')
      router.push(first.href)
    } else if (event.key === 'Escape') {
      if (query) setQuery('')
      else event.currentTarget.blur()
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={allowed.homeHref}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <WarehouseIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">3PL 플랫폼</span>
                  <span className="truncate text-xs text-muted-foreground">{allowed.title}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* 접힌 사이드바(아이콘만)에서는 검색칸·탭을 숨긴다 */}
        <div className="space-y-2 group-data-[collapsible=icon]:hidden">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <SidebarInput
              ref={searchInput}
              type="search"
              aria-label="메뉴 검색"
              placeholder="메뉴 검색 (초성 가능)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              className="pr-10 pl-7"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1 font-sans text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
          {!searching && (
            <Tabs value={tab} onValueChange={(value) => changeTab(value as SidebarTab)}>
              <TabsList className="w-full">
                <TabsTrigger value="all">전체</TabsTrigger>
                <TabsTrigger value="favorites">즐겨찾기</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {favoriteError && (
          <p role="alert" className="px-4 pt-2 text-xs text-destructive">
            {favoriteError}
          </p>
        )}
        {searching ? (
          searchResult.groups.length > 0 ? (
            <SidebarNavList
              groups={searchResult.groups}
              activeHref={activeHref}
              favorites={favoriteSet}
              onToggleFavorite={toggleFavorite}
            />
          ) : (
            <SidebarMessage>&apos;{query.trim()}&apos;와 일치하는 메뉴가 없습니다.</SidebarMessage>
          )
        ) : tab === 'favorites' ? (
          favoriteGroups.length > 0 ? (
            <SidebarNavList
              groups={favoriteGroups}
              activeHref={activeHref}
              favorites={favoriteSet}
              onToggleFavorite={toggleFavorite}
            />
          ) : (
            <SidebarMessage>
              즐겨찾기한 메뉴가 없습니다. [전체] 탭에서 메뉴 옆 ☆를 눌러 추가하세요.
            </SidebarMessage>
          )
        ) : (
          <SidebarNavList
            groups={allowed.groups}
            activeHref={activeHref}
            favorites={favoriteSet}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </SidebarContent>

      {/* 사이드바 가장자리를 눌러도 접고 펼 수 있다 */}
      <SidebarRail />
    </Sidebar>
  )
}

// 사이드바 안내 문구 (검색 결과 없음, 즐겨찾기 없음)
function SidebarMessage({ children }: { children: React.ReactNode }) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <p className="px-2 py-4 text-sm text-muted-foreground">{children}</p>
    </SidebarGroup>
  )
}
