import { describe, expect, it } from 'vitest'
import { navigation } from '@/config/navigation'
import { matchesQuery, searchNavigation } from './search-navigation'

const titles = (query: string) =>
  searchNavigation(navigation.admin, query).groups.flatMap((group) =>
    group.items.map((item) => item.title),
  )

describe('matchesQuery', () => {
  it('글자가 들어 있으면 찾고, 대소문자·띄어쓰기는 무시한다', () => {
    expect(matchesQuery('재고 조회', '고조')).toBe(true)
    expect(matchesQuery('ASN 조회', 'asn')).toBe(true)
    expect(matchesQuery('ASN 조회', 'a s n 조')).toBe(true)
    expect(matchesQuery('품목', '거래')).toBe(false)
  })

  it('초성으로 찾고, 글자와 초성을 섞어도 된다', () => {
    expect(matchesQuery('품목', 'ㅍㅁ')).toBe(true)
    expect(matchesQuery('재고 조회', 'ㅈㄱㅈㅎ')).toBe(true)
    expect(matchesQuery('재고 조회', '재ㄱ')).toBe(true)
    expect(matchesQuery('품목', 'ㅁㅍ')).toBe(false)
    // 초성은 그 글자의 첫소리와만 맞는다 ('ㅁ'은 '목'의 받침이 아니라 첫소리 ㅁ)
    expect(matchesQuery('적치', 'ㅈㅊ')).toBe(true)
    expect(matchesQuery('적치', 'ㄱ')).toBe(false)
  })

  it('빈 검색어는 모두 맞는다', () => {
    expect(matchesQuery('품목', '  ')).toBe(true)
  })
})

describe('searchNavigation', () => {
  it('맞는 메뉴만 남기고, 메뉴가 없는 묶음은 뺀다', () => {
    expect(titles('ㅍㅁ')).toEqual(['품목'])
    expect(searchNavigation(navigation.admin, 'ㅍㅁ').groups.map((g) => g.label)).toEqual([
      '기준정보',
    ])
  })

  it('묶음 이름이 맞으면 그 묶음의 메뉴를 모두 보여준다', () => {
    const inbound = navigation.admin.groups.find((g) => g.label === '입고')!
    expect(titles('입고')).toEqual(expect.arrayContaining(inbound.items.map((item) => item.title)))
  })

  it('검색어가 비어 있으면 목록 그대로, 맞는 게 없으면 빈 목록', () => {
    expect(searchNavigation(navigation.admin, '')).toBe(navigation.admin)
    expect(titles('없는메뉴')).toEqual([])
  })
})
