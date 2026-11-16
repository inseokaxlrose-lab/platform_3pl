'use client'

import { ChevronRightIcon, StarIcon } from 'lucide-react'
import Link from 'next/link'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { NavGroup } from '@/config/navigation'
import { cn } from '@/lib/utils'

type SidebarNavListProps = {
  groups: NavGroup[]
  // 지금 보고 있는 메뉴 주소 (선택 표시)
  activeHref?: string | null
  // 즐겨찾기한 메뉴 주소
  favorites: ReadonlySet<string>
  onToggleFavorite: (href: string, favorite: boolean) => void
  // 대메뉴 접기 (0070): 없으면 접을 수 없다 (메뉴 검색 결과는 늘 펼친다)
  collapse?: {
    closed: ReadonlySet<string>
    onToggle: (label: string) => void
  }
}

// 사이드바 메뉴 목록: 묶음 제목 + 메뉴 줄 (+ 즐겨찾기 별)
// - 별: 마우스를 올리거나 키보드로 갔을 때 보이고, 즐겨찾기한 메뉴는 늘 채운 별로 보인다
// - "준비 중" 메뉴는 열 수 없으므로 별이 없다
// - 대메뉴 제목을 누르면 묶음을 접고 편다 (0070). 접힌 묶음에 지금 보는 메뉴가 있으면 제목에 ●
//   사이드바를 아이콘만 보이게 접었을 때는 묶음 접기와 상관없이 아이콘을 모두 보인다
export function SidebarNavList({
  groups,
  activeHref,
  favorites,
  onToggleFavorite,
  collapse,
}: SidebarNavListProps) {
  return groups.map((group, index) => {
    const label = group.label
    const closed = Boolean(collapse && label && collapse.closed.has(label))
    const hasActive = group.items.some((item) => item.href === activeHref)
    const listId = `sidebar-group-${index}`
    return (
      <SidebarGroup key={label ?? index}>
        {label &&
          (collapse ? (
            <SidebarGroupLabel asChild>
              <button
                type="button"
                aria-expanded={!closed}
                aria-controls={listId}
                onClick={() => collapse.onToggle(label)}
                className="w-full cursor-pointer justify-between hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <span className="flex items-center gap-1.5">
                  {label}
                  {closed && hasActive && (
                    <span
                      aria-label="지금 보는 메뉴가 있음"
                      className="size-1.5 rounded-full bg-primary"
                    />
                  )}
                </span>
                <ChevronRightIcon
                  aria-hidden
                  className={cn('transition-transform', !closed && 'rotate-90')}
                />
              </button>
            </SidebarGroupLabel>
          ) : (
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
          ))}
        {/* 접힌 묶음: 숨김 (아이콘만 보이는 사이드바에서는 보인다) */}
        <SidebarMenu
          id={listId}
          hidden={closed}
          className={cn(closed && 'group-data-[collapsible=icon]:flex!')}
        >
          {group.items.map((item) => {
            const favorite = favorites.has(item.href)
            return (
              <SidebarMenuItem key={item.href}>
                {item.ready ? (
                  <>
                    <SidebarMenuButton
                      asChild
                      isActive={item.href === activeHref}
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover={!favorite}
                      aria-label={
                        favorite ? `${item.title} 즐겨찾기 해제` : `${item.title} 즐겨찾기 추가`
                      }
                      aria-pressed={favorite}
                      title={favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                      onClick={() => onToggleFavorite(item.href, !favorite)}
                    >
                      <StarIcon
                        className={cn(favorite && 'fill-warning text-warning')}
                        aria-hidden
                      />
                    </SidebarMenuAction>
                  </>
                ) : (
                  // 아직 만들지 않은 화면: 흐리게 표시, 누를 수 없음
                  <>
                    <SidebarMenuButton aria-disabled tooltip={`${item.title} (준비 중)`}>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge className="text-muted-foreground">준비 중</SidebarMenuBadge>
                  </>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroup>
    )
  })
}
