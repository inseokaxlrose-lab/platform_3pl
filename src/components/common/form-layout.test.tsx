import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormColumns, FormRow, FormSection } from './form-layout'

describe('FormColumns', () => {
  it('왼쪽만 주면 오른쪽 단을 만들지 않는다 (정보가 적은 화면)', () => {
    const { container } = render(<FormColumns left={<p>왼쪽</p>} />)
    expect(container.querySelector('[data-column="left"]')?.textContent).toBe('왼쪽')
    expect(container.querySelector('[data-column="right"]')).toBeNull()
  })

  it('오른쪽도 주면 왼쪽에서 오른쪽으로 이어서 배치한다 (정보가 많은 화면)', () => {
    const { container } = render(<FormColumns left={<p>왼쪽</p>} right={<p>오른쪽</p>} />)
    expect(container.querySelector('[data-column="right"]')?.textContent).toBe('오른쪽')
  })
})

describe('FormSection', () => {
  it('제목으로 찾을 수 있는 묶음 상자, 오른쪽 버튼 자리', () => {
    render(
      <FormSection title="담당자" action={<button type="button">추가</button>}>
        <input aria-label="이름" />
      </FormSection>,
    )
    const section = screen.getByRole('region', { name: '담당자' })
    expect(section.querySelector('h2')?.textContent).toBe('담당자')
    expect(screen.getByRole('button', { name: '추가' })).toBeTruthy()
  })
})

describe('FormRow', () => {
  it('넓은 화면에서 한 줄에 2칸 (좁으면 1칸)', () => {
    const { container } = render(
      <FormRow>
        <input aria-label="업태" />
        <input aria-label="종목" />
      </FormRow>,
    )
    expect(container.firstElementChild?.className).toContain('sm:grid-cols-2')
    expect(container.firstElementChild?.children).toHaveLength(2)
  })
})
