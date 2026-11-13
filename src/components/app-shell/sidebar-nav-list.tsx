'use client'

import { StarIcon } from 'lucide-react'
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
}

// 사이드바 메뉴 목록: 묶음 제목 + 메뉴 줄 (+ 즐겨찾기 별)
// - 별: 마우스를 올리거나 키보드로 갔을 때 보이고, 즐겨찾기한 메뉴는 늘 채운 별로 보인다
// - "준비 중" 메뉴는 열 수 없으므로 별이 없다
export function SidebarNavList({
  groups,
  activeHref,
  favorites,
  onToggleFavorite,
}: SidebarNavListProps) {
  return groups.map((group, index) => (
    <SidebarGroup key={group.label ?? index}>
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarMenu>
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
                    <StarIcon className={cn(favorite && 'fill-warning text-warning')} aria-hidden />
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
  ))
}
