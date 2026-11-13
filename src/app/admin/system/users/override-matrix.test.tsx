import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { PermissionCode } from '@/config/permissions'
import { EMPTY_OVERRIDES, type Overrides } from '@/lib/permissions/override-state'
import { OverrideMatrix } from './override-matrix'

const GROUP: PermissionCode[] = ['master.items.read', 'master.items.update']

function Harness({ includeOperatorOnly = false }: { includeOperatorOnly?: boolean }) {
  const [value, setValue] = useState<Overrides>(EMPTY_OVERRIDES)
  return (
    <>
      <OverrideMatrix
        area="admin"
        includeOperatorOnly={includeOperatorOnly}
        groupCodes={GROUP}
        value={value}
        onChange={setValue}
      />
      <output data-testid="grants">{value.grants.join(',')}</output>
      <output data-testid="denies">{value.denies.join(',')}</output>
    </>
  )
}

// 이름 앞부분(메뉴 + 동작)으로 칸 찾기: 뒤의 상태 설명은 바뀌므로
const cell = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}:`) })
const text = (id: string) => screen.getByTestId(id).textContent

describe('OverrideMatrix', () => {
  it('그룹에 있는 권한과 없는 권한을 구분해 보여준다', () => {
    render(<Harness />)
    expect(cell('품목 수정').getAttribute('aria-label')).toBe('품목 수정: 그룹대로 (있음)')
    expect(cell('품목 등록').getAttribute('aria-label')).toBe('품목 등록: 그룹대로 (없음)')
  })

  it('칸을 누를 때마다 그룹대로 → 추가 → 제외 → 그룹대로', () => {
    render(<Harness />)
    fireEvent.click(cell('품목 등록'))
    expect(cell('품목 등록').getAttribute('data-state')).toBe('grant')
    expect(text('grants')).toBe('master.items.create')

    fireEvent.click(cell('품목 등록'))
    expect(cell('품목 등록').getAttribute('data-state')).toBe('deny')
    expect(text('grants')).toBe('')
    expect(text('denies')).toBe('master.items.create')

    fireEvent.click(cell('품목 등록'))
    expect(cell('품목 등록').getAttribute('data-state')).toBe('inherit')
    expect(text('denies')).toBe('')
  })

  it('시스템 메뉴는 운영사 사용자일 때만 나온다', () => {
    const { unmount } = render(<Harness />)
    expect(screen.queryByRole('button', { name: /^사용자 조회:/ })).toBeNull()
    unmount()

    render(<Harness includeOperatorOnly />)
    expect(cell('사용자 조회')).toBeTruthy()
  })
})
