import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormRow, FormSection } from './form-layout'

describe('FormSection', () => {
  it('제목으로 찾을 수 있는 묶음 (카드 대신 구분선), 오른쪽 버튼 자리', () => {
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
