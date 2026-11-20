// 코스 우편번호 붙여넣기 해석 (docs/decisions/0095) — 화면·서버 공용
// 쉼표·줄바꿈·띄어쓰기로 나눈 5자리 우편번호, '16300-16399'·'16300~16399' 같은 범위를 받는다
// 범위는 한 번에 1,000개까지 (실수로 00000-99999를 넣는 것을 막는다)

export const MAX_ZIP_RANGE = 1000

export type ZipParseResult = { zips: string[]; invalid: string[] }

export function parseZipInput(text: string): ZipParseResult {
  const zips = new Set<string>()
  const invalid: string[] = []
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const range = /^(\d{5})[-~](\d{5})$/.exec(token)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      if (from > to || to - from + 1 > MAX_ZIP_RANGE) {
        invalid.push(token)
        continue
      }
      for (let n = from; n <= to; n++) zips.add(String(n).padStart(5, '0'))
      continue
    }
    if (/^\d{5}$/.test(token)) zips.add(token)
    else invalid.push(token)
  }
  return { zips: [...zips].sort(), invalid }
}
