import type { Metadata } from 'next'
import { ThemeToggle } from '@/components/theme-toggle'
import { ComponentsShowcase } from './components-showcase'

export const metadata: Metadata = { title: '입력 컴포넌트' }

// 기준정보 입력 공통 컴포넌트 견본: 각 부품을 단독으로 써 보고, 바깥으로 나가는 값을 확인한다
export default function ComponentsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">입력 컴포넌트</h1>
          <p className="text-sm text-muted-foreground">
            기준정보 화면 공통 부품 견본 · 사용법은 docs/ui-guidelines.md
          </p>
        </div>
        <ThemeToggle />
      </header>
      <ComponentsShowcase />
    </div>
  )
}
