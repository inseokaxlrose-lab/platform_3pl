import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { PermissionArea, PermissionCode } from '@/config/permissions'
import { PermissionMatrix } from './permission-matrix'

function Harness({
  area = 'admin',
  initial = [],
}: {
  area?: PermissionArea
  initial?: PermissionCode[]
}) {
  const [codes, setCodes] = useState<PermissionCode[]>(initial)
  return (
    <>
      <PermissionMatrix area={area} value={codes} onChange={setCodes} />
      <output data-testid="codes">{[...codes].sort().join(',')}</output>
    </>
  )
}

const box = (name: string) => screen.getByRole('checkbox', { name })
const codes = () => screen.getByTestId('codes').textContent

describe('PermissionMatrix', () => {
  it('영역의 메뉴만, 메뉴에 있는 동작만 체크박스가 나온다', () => {
    render(<Harness />)
    expect(box('ASN 잔량 마감')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: '라벨 인쇄 삭제' })).toBeNull() // 라벨 인쇄에는 삭제 없음
    expect(screen.queryByRole('checkbox', { name: '내 재고 조회' })).toBeNull() // 포털 메뉴
  })

  it('버튼 권한을 체크하면 조회도 체크되고, 조회를 해제하면 줄 전체가 해제된다', () => {
    render(<Harness />)
    fireEvent.click(box('ASN 잔량 마감'))
    expect(codes()).toBe('inbound.asn.close,inbound.asn.read')
    expect(box('ASN 조회').getAttribute('data-state')).toBe('checked')

    fireEvent.click(box('ASN 조회'))
    expect(codes()).toBe('')
  })

  it('줄 전체와 묶음 전체', () => {
    render(<Harness />)
    fireEvent.click(box('라벨 인쇄 전체'))
    expect(codes()).toBe('inbound.labels.print,inbound.labels.read')
    expect(box('입고 전체').getAttribute('data-state')).toBe('indeterminate')

    fireEvent.click(box('입고 전체'))
    expect(box('입고 전체').getAttribute('data-state')).toBe('checked')
    expect(codes()).toContain('inbound.putaway.confirm')
  })

  it('포털 영역은 포털 메뉴만', () => {
    render(<Harness area="portal" />)
    expect(box('내 재고 조회')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'ASN 잔량 마감' })).toBeNull()
  })
})
