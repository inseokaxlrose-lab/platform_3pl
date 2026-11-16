import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PageError, PageLoading, PageNotFound } from './page-states'

// 화면 상태 공통 부품 (0066)

describe('화면 상태', () => {
  it('불러오는 중: 화면 읽기 프로그램이 알 수 있게', () => {
    render(<PageLoading />)
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeTruthy()
  })

  it('오류: 쉬운 문구 + 오류 번호, [다시 시도]는 reset, [처음으로]는 영역 홈', () => {
    const reset = vi.fn()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = Object.assign(new Error('DB 연결 실패 상세'), { digest: 'abc123' })
    render(<PageError error={error} reset={reset} homeHref="/portal" />)
    expect(screen.getByText('화면을 불러오지 못했습니다')).toBeTruthy()
    expect(screen.getByText('오류 번호: abc123')).toBeTruthy()
    // 자세한 오류 내용은 화면에 보이지 않는다
    expect(screen.queryByText(/DB 연결 실패/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(reset).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: '처음으로' }).getAttribute('href')).toBe('/portal')
    spy.mockRestore()
  })

  it('찾을 수 없음', () => {
    render(<PageNotFound homeHref="/admin" />)
    expect(screen.getByText('찾을 수 없습니다')).toBeTruthy()
    expect(screen.getByRole('link', { name: '처음으로' }).getAttribute('href')).toBe('/admin')
  })
})
