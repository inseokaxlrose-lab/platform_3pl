import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { parseHelpDocument } from '@/lib/help/parse-help'
import { HelpContent } from './help-content'

// 도움말 꾸미기 (0077): 버튼 칩 · 경고 상자 · 단계 번호 · 접는 단락 · 목차

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const doc = (body: string) => parseHelpDocument(['---', 'title: 견본', '---', body].join('\n'))

describe('HelpContent', () => {
  it("'[저장]'은 버튼 칩, 링크·코드 속 대괄호는 그대로", () => {
    const { container } = render(
      <HelpContent
        document={doc(
          '소개 [저장]을 누릅니다.\n## [센터 지정] 버튼\n[링크](/x) · `[코드]` · [계속 등록]',
        )}
      />,
    )
    const chips = [...container.querySelectorAll('kbd')].map((k) => k.textContent)
    expect(chips).toEqual(['저장', '센터 지정', '계속 등록'])
    expect(screen.getByRole('link', { name: '링크' })).toBeTruthy()
    expect(container.querySelector('code')?.textContent).toBe('[코드]')
  })

  it('> [!TIP]·[!WARNING]은 이름 붙은 상자, 표시 줄은 지운다 (보통 인용은 그대로)', () => {
    const { container } = render(
      <HelpContent
        document={doc(
          '> [!TIP]\n> 경계 우편번호는 기본 제외입니다.\n\n> [!WARNING] 폐쇄 센터는 배정할 수 없습니다.\n\n> 그냥 인용',
        )}
      />,
    )
    const tip = screen.getByRole('note', { name: '팁' })
    expect(tip.textContent).toContain('경계 우편번호는 기본 제외입니다.')
    expect(tip.textContent).not.toContain('[!TIP]')
    expect(screen.getByRole('note', { name: '주의' }).textContent).toContain('폐쇄 센터')
    expect(container.querySelector('blockquote')?.textContent?.trim()).toBe('그냥 인용')
  })

  it('번호 목록은 단계, 단락은 접고 펼 수 있고 3개 이상이면 목차', () => {
    const { container } = render(
      <HelpContent
        document={doc('## 하나\n1. 고른다\n2. 누른다\n## 둘\n본문\n## [셋] 버튼\n끝')}
      />,
    )
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
    const sections = container.querySelectorAll('details')
    expect(sections).toHaveLength(3)
    expect([...sections].every((d) => d.open)).toBe(true)

    const toc = screen.getByRole('navigation', { name: '도움말 목차' })
    const items = within(toc).getAllByRole('button')
    expect(items.map((b) => b.textContent)).toEqual(['하나', '둘', '셋 버튼'])
    // 접힌 단락도 목차를 누르면 펼쳐진다
    sections[2].open = false
    fireEvent.click(items[2])
    expect(sections[2].open).toBe(true)
  })

  it('단락이 2개 이하면 목차 없음', () => {
    render(<HelpContent document={doc('## 하나\n가\n## 둘\n나')} />)
    expect(screen.queryByRole('navigation', { name: '도움말 목차' })).toBeNull()
  })
})

describe('HelpContent 화면 사진', () => {
  it('/help/ 사진은 라이트·다크 두 장 + 크게 보기, 바깥 주소 사진은 설명 글자만', () => {
    const { container } = render(
      <HelpContent
        document={doc(
          '## 화면\n![배정 탭](/help/admin/master/regions/assign.png)\n\n![바깥](https://example.com/x.png)',
        )}
      />,
    )
    const images = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(images).toEqual([
      '/help/admin/master/regions/assign.png',
      '/help/admin/master/regions/assign.dark.png',
    ])
    expect(screen.getByRole('button', { name: '배정 탭 크게 보기' })).toBeTruthy()
    expect(screen.getByText('바깥')).toBeTruthy()
  })
})
