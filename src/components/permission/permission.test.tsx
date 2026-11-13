import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PermissionCode } from '@/config/permissions'
import { AccessDenied, Can, PermissionProvider } from './index'

function renderWith(codes: PermissionCode[], ui: React.ReactNode) {
  return render(<PermissionProvider codes={codes}>{ui}</PermissionProvider>)
}

describe('Can', () => {
  it('권한이 있으면 보여준다', () => {
    renderWith(
      ['inbound.asn.read', 'inbound.asn.close'],
      <Can permission="inbound.asn.close">
        <button type="button">잔량 마감</button>
      </Can>,
    )
    expect(screen.getByRole('button', { name: '잔량 마감' })).toBeTruthy()
  })

  it('권한이 없으면 숨기고, fallback이 있으면 대신 보여준다', () => {
    renderWith(
      ['inbound.asn.read'],
      <>
        <Can permission="inbound.asn.close">
          <button type="button">잔량 마감</button>
        </Can>
        <Can permission="inbound.asn.delete" fallback={<span>삭제 권한 없음</span>}>
          <button type="button">삭제</button>
        </Can>
      </>,
    )
    expect(screen.queryByRole('button', { name: '잔량 마감' })).toBeNull()
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull()
    expect(screen.getByText('삭제 권한 없음')).toBeTruthy()
  })

  it('PermissionProvider 밖에서 쓰면 바로 알려준다 (실수 방지)', () => {
    expect(() => render(<Can permission="inbound.asn.read">x</Can>)).toThrow(/PermissionProvider/)
  })
})

describe('AccessDenied', () => {
  it('권한 없음 안내와 홈으로 가는 링크를 보여준다', () => {
    render(<AccessDenied />)
    expect(screen.getByText('접근 권한이 없습니다')).toBeTruthy()
    expect(screen.getByRole('link', { name: /홈으로/ }).getAttribute('href')).toBe('/')
  })
})
