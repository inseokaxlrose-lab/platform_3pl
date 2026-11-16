'use client'

import { ExternalLinkIcon, HouseIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { usePermission } from '@/components/permission'
import { navigation, type NavAreaKey } from '@/config/navigation'
import { askBeforeLeave, usePageDirty } from '@/lib/navigation/page-dirty'
import { cn } from '@/lib/utils'
import { filterNavigation } from './filter-navigation'
import { findActiveHref } from './find-active-href'
import { closeMenuTab } from './menu-tabs-state'
import { closeTab, openTab, useMenuTabs } from './menu-tabs-store'

// 상단 메뉴 탭 (docs/decisions/0069): 연 메뉴를 책갈피처럼 모아 두고 눌러서 오간다
// - 탭을 누르면 그 메뉴에서 마지막으로 보던 주소로 (검색 조건·하위 화면 그대로)
// - 저장하지 않은 변경이 있는 화면은 ● (마우스를 올리면 ×), 떠날 때는 확인 창
// - ↗: 새 창으로 열기 (나란히 보고 싶을 때)
export function MenuTabs({ area }: { area: NavAreaKey }) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const router = useRouter()
  const { codes } = usePermission()
  const tabs = useMenuTabs(area)
  const dirty = usePageDirty()

  const allowed = filterNavigation(navigation[area], codes)
  const items = allowed.groups.flatMap((group) => group.items).filter((item) => item.ready)
  const homeHref = allowed.homeHref
  const activeHref = findActiveHref(pathname, items)
  const url = search ? `${pathname}?${search}` : pathname

  // [×]로 닫는 중인 보던 탭: 다른 화면으로 옮겨 간 뒤에 목록에서 뺀다 (확인 창에서 [계속 작성]이면 남는다)
  const closing = useRef<string | null>(null)

  // 화면이 바뀔 때마다: 그 메뉴 탭을 열거나 주소를 고쳐 둔다
  useEffect(() => {
    if (closing.current && closing.current !== activeHref) {
      closeTab(area, closing.current)
      closing.current = null
    }
    if (!activeHref || activeHref === homeHref || closing.current === activeHref) return
    openTab(area, activeHref, url)
  }, [area, activeHref, homeHref, url])

  function close(href: string) {
    if (href !== activeHref) {
      closeTab(area, href)
      return
    }
    // 보던 탭: 옆 탭(없으면 홈)으로 옮긴 뒤 닫는다. 변경 중이면 확인 창이 먼저
    const next = closeMenuTab(tabs, href).next?.url ?? homeHref
    closing.current = href
    if (!askBeforeLeave(next)) router.push(next)
  }

  const shown = tabs.flatMap((tab) => {
    const item = items.find((i) => i.href === tab.href)
    // 권한이 바뀌어 볼 수 없게 된 메뉴는 그리지 않는다
    return item ? [{ tab, item }] : []
  })

  return (
    <nav
      aria-label="열린 메뉴"
      // 탭 줄 바탕은 본문보다 살짝 어둡게 → 본문과 같은 바탕인 선택된 탭이 튀어나와 보인다
      // 아래 선은 안쪽 그림자로 → 선택된 탭의 바탕이 그 선을 덮어 본문과 이어진다
      className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto bg-muted px-2 shadow-[inset_0_-1px_0_var(--border)]"
    >
      <TabLink
        href={homeHref}
        label="홈"
        icon={<HouseIcon />}
        active={pathname === homeHref}
        dirty={pathname === homeHref && dirty}
      />
      {shown.map(({ tab, item }) => {
        const active = tab.href === activeHref
        return (
          <TabLink
            key={tab.href}
            href={active ? url : tab.url}
            label={item.title}
            icon={<item.icon />}
            active={active}
            dirty={active && dirty}
            onClose={() => close(tab.href)}
          />
        )
      })}
    </nav>
  )
}

function TabLink({
  href,
  label,
  icon,
  active,
  dirty,
  onClose,
}: {
  href: string
  label: string
  icon: React.ReactNode
  active: boolean
  dirty: boolean
  // 없으면 닫을 수 없는 탭 (홈)
  onClose?: () => void
}) {
  return (
    <div
      className={cn(
        // 고정 폭: 이름 길이와 상관없이 같은 크기 (메뉴 탭 176px, 닫기 없는 홈 탭 96px), 넘치면 … 처리
        'group relative flex h-8 shrink-0 items-center rounded-t-md border border-b-0 text-sm transition-colors',
        onClose ? 'w-44' : 'w-24',
        // 선택된 탭: 위쪽 브랜드 색 띠 + 본문과 같은 바탕(탭 줄 아래 선을 덮어 본문과 이어진 것처럼)
        active
          ? 'border-t-2 border-border border-t-primary bg-background font-semibold text-foreground [&_a>svg]:text-primary'
          : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground',
      )}
    >
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-3 outline-none focus-visible:underline [&_svg]:size-3.5 [&_svg]:shrink-0"
      >
        {icon}
        <span className="truncate">{label}</span>
        {dirty && <span className="sr-only"> (저장하지 않은 변경 있음)</span>}
      </Link>
      {/* 새 창으로 열기: 마우스를 올리거나 키보드로 갔을 때 보인다 */}
      <a
        href={href}
        target="_blank"
        rel="noopener"
        aria-label={`${label} 새 창으로 열기`}
        title="새 창으로 열기"
        className="ml-1 flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 [&_svg]:size-3"
      >
        <ExternalLinkIcon />
      </a>
      <span className={cn('flex w-6 justify-center', !onClose && 'w-2')}>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={`${label} 탭 닫기`}
            title={dirty ? '저장하지 않은 변경이 있습니다 — 닫기' : '닫기'}
            className="relative flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3"
          >
            {dirty ? (
              <>
                {/* 변경 중: ●, 마우스를 올리면 × */}
                <span aria-hidden className="size-2 rounded-full bg-primary group-hover:hidden" />
                <XIcon className="hidden group-hover:block" />
              </>
            ) : (
              <XIcon />
            )}
          </button>
        ) : (
          dirty && <span aria-hidden className="size-2 rounded-full bg-primary" />
        )}
      </span>
    </div>
  )
}
