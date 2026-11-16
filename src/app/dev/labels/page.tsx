import type { Metadata } from 'next'
import { ThemeToggle } from '@/components/theme-toggle'
import { LabelsShowcase } from './labels-showcase'

export const metadata: Metadata = { title: '라벨 양식' }

// 라벨 양식 4종 견본 (0055): 예시 데이터로 크기·배치를 확인한다
export default function LabelsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">라벨 양식</h1>
          <p className="text-sm text-muted-foreground">
            PLT 2종 + BOX 2종 · 실제 크기(mm)로 그린다 · 사용법은 docs/decisions/0055
          </p>
        </div>
        <ThemeToggle />
      </header>
      <LabelsShowcase />
    </div>
  )
}
