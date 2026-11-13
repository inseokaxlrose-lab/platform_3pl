import type { Metadata } from 'next'
import { ThemeToggle } from '@/components/theme-toggle'
import { GridShowcase } from './grid-showcase'

export const metadata: Metadata = { title: 'DataGrid 쇼케이스' }

// DataGrid 쇼케이스 화면 (개발 모드에서만 열림)
export default function GridShowcasePage() {
  return (
    <div className="mx-auto w-full max-w-7xl p-8">
      <div className="mb-4 flex justify-end">
        <ThemeToggle />
      </div>
      <GridShowcase />
    </div>
  )
}
