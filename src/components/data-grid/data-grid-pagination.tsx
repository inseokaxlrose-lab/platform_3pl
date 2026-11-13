'use client'

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatNumber } from './format'
import { getPageCount, PAGE_SIZE_OPTIONS } from './state'

type DataGridPaginationProps = {
  rowCount: number
  pageIndex: number
  pageSize: number
  onPageIndexChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
}

// 그리드 아래 페이지 이동: 총 건수 · 한 페이지 건수 · 페이지 번호 · 이동 버튼
export function DataGridPagination({
  rowCount,
  pageIndex,
  pageSize,
  onPageIndexChange,
  onPageSizeChange,
}: DataGridPaginationProps) {
  const pageCount = getPageCount(rowCount, pageSize)
  const canPrev = pageIndex > 0
  const canNext = pageIndex < pageCount - 1

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        총{' '}
        <span className="font-medium text-foreground tabular-nums">{formatNumber(rowCount)}</span>건
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger size="sm" aria-label="한 페이지 건수" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}개씩
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="tabular-nums">
          {formatNumber(pageIndex + 1)} / {formatNumber(pageCount)} 페이지
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="첫 페이지"
            disabled={!canPrev}
            onClick={() => onPageIndexChange(0)}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="이전 페이지"
            disabled={!canPrev}
            onClick={() => onPageIndexChange(pageIndex - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="다음 페이지"
            disabled={!canNext}
            onClick={() => onPageIndexChange(pageIndex + 1)}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="마지막 페이지"
            disabled={!canNext}
            onClick={() => onPageIndexChange(pageCount - 1)}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}
