'use client'

import { WarehouseIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { navigation, type NavAreaKey } from '@/config/navigation'
import { findActiveHref } from './find-active-href'

// 왼쪽 메뉴 사이드바
// 아이콘(함수)은 서버→브라우저로 전달할 수 없으므로, 영역 이름(area)만 받아 메뉴 목록을 직접 불러온다
export function AppSidebar({ area }: { area: NavAreaKey }) {
  const pathname = usePathname()
  const { title, homeHref, groups } = navigation[area]
  const activeHref = findActiveHref(
    pathname,
    groups.flatMap((group) => group.items),
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={homeHref}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <WarehouseIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">3PL 플랫폼</span>
                  <span className="truncate text-xs text-muted-foreground">{title}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group, index) => (
          <SidebarGroup key={group.label ?? index}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  {item.ready ? (
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
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* 사이드바 가장자리를 눌러도 접고 펼 수 있다 */}
      <SidebarRail />
    </Sidebar>
  )
}
