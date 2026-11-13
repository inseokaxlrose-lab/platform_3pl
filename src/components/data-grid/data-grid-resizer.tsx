'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { clampWidth } from './settings'

// 키보드로 조절할 때 한 번에 바뀌는 너비(px)
export const KEYBOARD_STEP = 10

type ColumnResizerProps = {
  // 화면 읽기 프로그램용 이름 (예: '수량')
  label: string
  // 지금 너비 (조절 시작 기준)
  getWidth: () => number
  // 끄는 동안: 화면만 바꾼다 (저장하지 않음)
  onPreview: (width: number) => void
  // 손을 뗐을 때·키보드: 확정해서 저장
  onCommit: (width: number) => void
  // 두 번 클릭: 기본 너비로
  onReset: () => void
}

// 컬럼 너비 조절 손잡이: 제목 칸 오른쪽 끝의 세로 막대
// 마우스(끌기)·키보드(←/→)·두 번 클릭(기본 너비) 모두 지원
export function ColumnResizer({
  label,
  getWidth,
  onPreview,
  onCommit,
  onReset,
}: ColumnResizerProps) {
  // 끌기 시작 위치·너비, 마지막 미리보기 너비
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`${label} 너비 조절`}
      aria-valuenow={Math.round(getWidth())}
      tabIndex={0}
      title="끌어서 너비 조절 · 두 번 클릭하면 기본 너비"
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        const startWidth = getWidth()
        drag.current = { startX: event.clientX, startWidth, width: startWidth }
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        const width = clampWidth(drag.current.startWidth + event.clientX - drag.current.startX)
        drag.current.width = width
        onPreview(width)
      }}
      onPointerUp={() => {
        if (!drag.current) return
        const { width, startWidth } = drag.current
        drag.current = null
        if (width !== startWidth) onCommit(width)
        else onPreview(width)
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const delta = event.key === 'ArrowRight' ? KEYBOARD_STEP : -KEYBOARD_STEP
        onCommit(clampWidth(getWidth() + delta))
      }}
      className={cn(
        // 칸 오른쪽 끝의 얇은 막대: 마우스를 올리거나 초점이 가면 포인트 색으로 보인다
        'absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none',
        'hover:bg-primary/40 focus-visible:bg-primary focus-visible:outline-none',
      )}
    />
  )
}
