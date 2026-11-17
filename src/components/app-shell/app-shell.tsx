import { cookies } from 'next/headers'
import { CommonCodeProvider } from '@/components/common-code'
import { GridSettingsProvider } from '@/components/data-grid/grid-settings-provider'
import type { GridSettings } from '@/components/data-grid/settings'
import { HelpProvider } from '@/components/help'
import { PermissionProvider } from '@/components/permission'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import type { NavAreaKey } from '@/config/navigation'
import type { PermissionCode } from '@/config/permissions'
import { loadCodeOptions } from '@/lib/common-code/common-codes'
import { loadHelpAction } from '@/lib/help/help-actions'
import { listHelpMenuHrefs } from '@/lib/help/load-help'
import { setFavoriteMenuAction } from '@/lib/navigation/favorite-actions'
import { getCurrentScope, type CurrentUser } from '@/lib/session'
import { ActingOperatorBanner } from './acting-operator-banner'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'
import {
  parseClosedGroups,
  parseSidebarTab,
  SIDEBAR_CLOSED_GROUPS_COOKIE,
  SIDEBAR_TAB_COOKIE,
} from './sidebar-tab'

// 운영사 화면 · 화주 포털 · 플랫폼 공통 뼈대: 사이드바 + 상단 바 + 본문
export async function AppShell({
  area,
  user,
  permissions,
  gridSettings,
  favoriteMenus,
  actingOperator,
  children,
}: {
  area: NavAreaKey
  // 레이아웃에서 requireUser로 확인한 로그인 사용자
  user: CurrentUser
  // 레이아웃에서 계산한 최종 권한 (메뉴·버튼 표시용)
  permissions: readonly PermissionCode[]
  // 레이아웃에서 읽은 사용자별 그리드 설정 (그리드 이름 → 설정, 0021)
  gridSettings: Record<string, GridSettings>
  // 사이드바 즐겨찾기 메뉴 주소 (추가한 순서, 0022)
  favoriteMenus: string[]
  // 플랫폼 관리자가 운영사로 전환해 작업 중이면 그 운영사 (화면 위에 띠를 보여 준다, 0039)
  actingOperator?: { name: string } | null
  children: React.ReactNode
}) {
  // 사이드바 접힘 상태는 쿠키에 저장된다 → 다음 접속 때도 같은 상태로 그린다
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'
  // 사이드바 탭도 마지막으로 연 탭으로 그린다
  const initialTab = parseSidebarTab(cookieStore.get(SIDEBAR_TAB_COOKIE)?.value)
  // 접어 둔 대메뉴 묶음도 (0070)
  const closedGroups = parseClosedGroups(cookieStore.get(SIDEBAR_CLOSED_GROUPS_COOKIE)?.value)
  // 공통코드 전체 (고르기 목록용, 0030): 수백 개 수준이라 요청마다 한 번에 읽는다
  const codeOptions = await loadCodeOptions((await getCurrentScope()).operatorId)

  return (
    <PermissionProvider codes={permissions}>
      <GridSettingsProvider initial={gridSettings}>
        <CommonCodeProvider options={codeOptions}>
          {/* 화면 도움말: 도움말 파일이 있는 메뉴 목록 + 불러오기 서버 액션 (0023) */}
          <HelpProvider menuHrefs={listHelpMenuHrefs()} load={loadHelpAction}>
            <SidebarProvider defaultOpen={defaultOpen}>
              <AppSidebar
                area={area}
                favorites={favoriteMenus}
                initialTab={initialTab}
                initialClosedGroups={closedGroups}
                onToggleFavorite={setFavoriteMenuAction}
              />
              {/* min-w-0: 넓은 표(재고 이력 등)가 본문을 창 밖으로 밀지 않고 표 안에서 옆으로 스크롤되게 */}
              <SidebarInset className="min-w-0">
                <AppHeader area={area} user={user} />
                {actingOperator && <ActingOperatorBanner name={actingOperator.name} />}
                <div className="flex-1 p-page">{children}</div>
              </SidebarInset>
            </SidebarProvider>
          </HelpProvider>
        </CommonCodeProvider>
      </GridSettingsProvider>
    </PermissionProvider>
  )
}
