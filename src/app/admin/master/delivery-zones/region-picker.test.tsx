import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { RegionPicker } from './region-picker'

function Harness({ initial = [] as string[], taken = {} as Record<string, string> }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <RegionPicker value={value} onChange={setValue} taken={taken} />
      <output data-testid="value">{value.join(',')}</output>
    </>
  )
}
const value = () => screen.getByTestId('value').textContent

describe('RegionPicker (담당 지역 고르기)', () => {
  it('시·군·구를 고르면 태그로 쌓이고, ×로 뺀다', () => {
    render(<Harness />)
    // 처음 시·도는 목록의 첫 번째(서울특별시)
    fireEvent.click(screen.getByRole('checkbox', { name: '종로구' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '중구' }))
    expect(value()).toBe('11110,11140')
    fireEvent.click(screen.getByRole('button', { name: '서울특별시 종로구 빼기' }))
    expect(value()).toBe('11140')
  })

  it('시·도 전체를 고르면 그 시·도의 시·군·구는 빠지고 잠긴다', () => {
    render(<Harness initial={['11110', '26']} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '서울특별시 전체' }))
    expect(value()).toBe('11,26')
    const jongno = screen.getByRole('checkbox', { name: '종로구' })
    expect(jongno.getAttribute('data-state')).toBe('checked')
    expect(jongno).toHaveProperty('disabled', true)
  })

  it('같은 센터의 다른 권역이 쓰는 지역은 잠기고 권역 이름이 붙는다 (시·도 전체면 그 안 모두)', () => {
    render(<Harness taken={{ '11': '서울 권역' }} />)
    expect(screen.getByRole('checkbox', { name: /서울특별시 전체/ })).toHaveProperty(
      'disabled',
      true,
    )
    expect(screen.getByRole('checkbox', { name: /종로구/ })).toHaveProperty('disabled', true)
    expect(screen.getAllByText('(서울 권역)').length).toBeGreaterThan(1)
  })
})
