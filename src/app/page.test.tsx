import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Home from './page'

describe('입구 화면', () => {
  it('운영사 화면과 화주 포털로 가는 링크가 있다', () => {
    render(<Home />)

    expect(screen.getByRole('link', { name: '운영사 화면' })).toHaveProperty('pathname', '/admin')
    expect(screen.getByRole('link', { name: '화주 포털' })).toHaveProperty('pathname', '/portal')
  })
})
