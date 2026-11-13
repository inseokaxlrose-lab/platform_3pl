import { describe, expect, it } from 'vitest'
import { filterHelpSections, parseHelpDocument } from './parse-help'

const DOC = `---
title: 사용자
summary: 계정을 만들고 관리합니다.
---

이 화면은 운영사 관리자만 씁니다.

## 화면 구성
목록에서 검색합니다.

<!-- 권한: system.users.create -->
## [사용자 등록] 버튼
- 아이디는 바꿀 수 없습니다.

<!--권한:system.users.update-->
## 사용 중지
로그인이 끊깁니다.
`

describe('도움말 문서 읽기', () => {
  it('제목·요약·소개와 단락을 나누고, 권한 표시를 바로 다음 단락에 붙인다', () => {
    const doc = parseHelpDocument(DOC)

    expect(doc.title).toBe('사용자')
    expect(doc.summary).toBe('계정을 만들고 관리합니다.')
    expect(doc.intro).toBe('이 화면은 운영사 관리자만 씁니다.')
    expect(doc.sections).toEqual([
      { permission: null, markdown: '## 화면 구성\n목록에서 검색합니다.' },
      {
        permission: 'system.users.create',
        markdown: '## [사용자 등록] 버튼\n- 아이디는 바꿀 수 없습니다.',
      },
      { permission: 'system.users.update', markdown: '## 사용 중지\n로그인이 끊깁니다.' },
    ])
  })

  it('권한 표시 줄은 본문에 남지 않는다', () => {
    const all = parseHelpDocument(DOC)
      .sections.map((s) => s.markdown)
      .join('\n')
    expect(all).not.toContain('<!--')
  })

  it('맨 위 정보가 없어도 읽는다 (제목은 빈 글자 → 검사 테스트가 잡는다)', () => {
    const doc = parseHelpDocument('## 하나\n내용')
    expect(doc).toEqual({
      title: '',
      summary: null,
      intro: '',
      sections: [{ permission: null, markdown: '## 하나\n내용' }],
    })
  })
})

describe('권한으로 거르기', () => {
  const doc = parseHelpDocument(DOC)
  const titlesFor = (codes: string[]) =>
    filterHelpSections(doc, new Set(codes)).sections.map((s) => s.markdown.split('\n')[0])

  it('권한 표시가 없는 단락은 누구나, 표시가 있으면 그 권한이 있을 때만', () => {
    expect(titlesFor([])).toEqual(['## 화면 구성'])
    expect(titlesFor(['system.users.update'])).toEqual(['## 화면 구성', '## 사용 중지'])
    expect(titlesFor(['system.users.create', 'system.users.update'])).toHaveLength(3)
  })
})
