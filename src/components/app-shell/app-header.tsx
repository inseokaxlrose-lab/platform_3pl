import { UserIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

// 상단 바: 사이드바 접기 버튼 · 테마 전환 · 사용자 메뉴
export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" aria-label="메뉴 접기/펴기" />
      <Separator
        orientation="vertical"
        className="mr-2 data-vertical:h-4 data-vertical:self-center"
      />
      {/* 화면 경로 표시(브레드크럼)는 공통 컴포넌트 작업에서 추가 */}
      <div className="flex-1" />
      <ThemeToggle />
      {/* 로그인 사용자 정보는 M1에서 연결 */}
      <Button variant="ghost" size="sm" disabled>
        <UserIcon />
        로그인 전
      </Button>
    </header>
  )
}
