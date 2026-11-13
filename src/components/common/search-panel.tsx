'use client'

import { RotateCcwIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type SearchPanelProps = {
  // 검색 입력칸들 (SearchField로 감싼다)
  children: React.ReactNode
  onSearch: () => void
  onReset?: () => void
  className?: string
}

// 검색 조건 영역: 입력칸을 화면 폭에 맞춰 1~4칸으로 배치하고, Enter·검색 버튼으로 검색한다
// 검색 조건을 주소(URL)에 저장하는 기능은 DataGrid 작업에서 연결한다
export function SearchPanel({ children, onSearch, onReset, className }: SearchPanelProps) {
  return (
    <form
      role="search"
      className={cn('mb-4 rounded-lg border bg-card p-4 text-card-foreground', className)}
      onSubmit={(e) => {
        e.preventDefault()
        onSearch()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="mt-4 flex justify-end gap-2">
        {onReset && (
          <Button type="button" variant="ghost" onClick={onReset}>
            <RotateCcwIcon />
            초기화
          </Button>
        )}
        <Button type="submit">
          <SearchIcon />
          검색
        </Button>
      </div>
    </form>
  )
}

type SearchFieldProps = {
  label: string
  // 입력칸의 id (라벨을 누르면 입력칸으로 이동)
  htmlFor?: string
  children: React.ReactNode
  className?: string
}

// 검색 입력칸 하나: 라벨 + 입력 요소
export function SearchField({ label, htmlFor, children, className }: SearchFieldProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
