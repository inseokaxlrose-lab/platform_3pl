import { createHash } from 'node:crypto'

// 주소 문자열 정리 (docs/decisions/0076, docs/address-normalization.md) — 순수 함수
// 정제 ②단계: 층·호·동호수, 괄호 안 내용, 특수문자, 중복 공백을 지우고 상세주소를 떼어 검색어를 만든다

// 공백·보이지 않는 글자 정리 (전각 공백·줄바꿈·탭 → 공백 하나)
export const squash = (text: string) =>
  text
    .normalize('NFC')
    .replace(/[\s\u3000\u00A0]+/g, ' ')
    .trim()

// 원본 우편번호 정리: 숫자만 남겨 5자리(신)·6자리(구)·그 밖(없음으로 봄)
export function cleanZip(zip: string | null | undefined) {
  const digits = (zip ?? '').replace(/\D/g, '')
  if (digits.length === 5) return { zip5: digits, zip6: null }
  if (digits.length === 6) return { zip5: null, zip6: digits }
  return { zip5: null, zip6: null }
}

// 건물번호(도로명 '…로 12', '…길 3-1') 또는 지번('…동 123-4', '…리 산 12')까지가 주소, 그 뒤는 상세주소
const ROAD_END = /^(.*?[가-힣0-9](?:로|길)\s*(?:지하\s*)?\d+(?:-\d+)?)(?=$|[\s,(])(.*)$/
const JIBUN_END = /^(.*?[가-힣0-9](?:동|리|가)\s*(?:산\s*)?\d+(?:-\d+)?)(?=$|[\s,(])(.*)$/

// 상세주소로 보이는 글자 (층·호·동호수·지하층)
const DETAIL_PATTERNS = [
  /\d+\s*동\s*\d+\s*호/g, // 101동 202호
  /(?:지하|B)\s*\d+\s*층/gi, // 지하1층, B1층
  /\d+(?:~\d+)?\s*층/g, // 3층, 3~4층
  /\d+(?:-\d+)?\s*호/g, // 202호, 1-2호
]

// 주소 → { 검색어, 상세주소 }. 상세주소가 따로 들어오면 그대로 붙여 준다
export function cleanAddress(address: string, detail?: string | null) {
  let text = squash(address)
  // 괄호 안 내용 (참고항목: 법정동·건물명) 빼기
  text = text.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')
  // 한글·영문·숫자·공백·하이픈만 남기기 (쉼표 등은 공백)
  text = text.replace(/[^가-힣a-zA-Z0-9\s-]/g, ' ')
  text = squash(text)

  const details: string[] = []
  const match = text.match(ROAD_END) ?? text.match(JIBUN_END)
  if (match) {
    text = match[1]
    if (match[2].trim()) details.push(match[2].trim())
  } else {
    // 건물번호를 못 찾으면 층·호만 떼어 낸다
    for (const pattern of DETAIL_PATTERNS) {
      text = text.replace(pattern, (found) => {
        details.push(found)
        return ' '
      })
    }
  }
  if (detail && squash(detail)) details.push(squash(detail))
  return { keyword: squash(text), detail: details.join(' ') || null }
}

// 캐시 키: 정리한 주소(공백 없이) + 원본 5·6자리 우편번호의 SHA-256
// (같은 주소를 띄어쓰기·괄호만 다르게 넣어도 같은 키)
export function addressCacheKey(address: string, zip?: string | null) {
  const { keyword } = cleanAddress(address)
  const { zip5, zip6 } = cleanZip(zip)
  const base = `${keyword.replace(/\s/g, '')}|${zip5 ?? zip6 ?? ''}`
  return createHash('sha256').update(base).digest('hex')
}
