import type { NavArea } from '@/config/navigation'

// 사이드바 메뉴 검색 (docs/decisions/0022)
// - 메뉴 이름에 검색어가 들어 있으면 찾는다 (대소문자·띄어쓰기 무시)
// - 초성으로도 찾는다: 'ㅍㅁ' → 품목, '재ㄱ' → 재고 조회 (글자와 초성을 섞어도 된다)
// - 묶음 이름이 맞으면 그 묶음의 메뉴를 모두 보여준다: '입고' → 입고 메뉴 전부

// 한글 음절의 첫소리(초성) 19개: '가'(0xAC00)부터 588자마다 초성이 바뀐다
const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const SYLLABLES_PER_CHOSEONG = 588

// 한 글자의 초성 (한글 음절이 아니면 null)
function choseongOf(char: string) {
  const code = char.charCodeAt(0)
  if (code < HANGUL_START || code > HANGUL_END) return null
  return CHOSEONG[Math.floor((code - HANGUL_START) / SYLLABLES_PER_CHOSEONG)]
}

// 비교용으로 정리: 소문자, 띄어쓰기 제거
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '')

// 검색 글자 하나가 메뉴 글자 하나와 맞는지: 같은 글자이거나, 검색 글자가 초성이고 메뉴 글자의 초성과 같음
function charMatches(textChar: string, queryChar: string) {
  if (textChar === queryChar) return true
  return CHOSEONG.includes(queryChar) && choseongOf(textChar) === queryChar
}

// 메뉴 이름(text)이 검색어(query)를 포함하는지 (초성 섞어 쓰기 포함)
export function matchesQuery(text: string, query: string) {
  const t = [...normalize(text)]
  const q = [...normalize(query)]
  if (q.length === 0) return true
  for (let start = 0; start + q.length <= t.length; start++) {
    if (q.every((queryChar, i) => charMatches(t[start + i], queryChar))) return true
  }
  return false
}

// 메뉴 목록에서 검색어에 맞는 메뉴만 남긴다 (검색어가 비어 있으면 그대로)
// 권한 거르기(filterNavigation)를 먼저 한 목록을 넣는다
export function searchNavigation(area: NavArea, query: string): NavArea {
  if (normalize(query).length === 0) return area
  return {
    ...area,
    groups: area.groups
      .map((group) =>
        group.label && matchesQuery(group.label, query)
          ? group
          : { ...group, items: group.items.filter((item) => matchesQuery(item.title, query)) },
      )
      .filter((group) => group.items.length > 0),
  }
}
