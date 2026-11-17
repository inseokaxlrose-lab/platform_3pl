// 요청 로그 본문의 개인정보 가리기 (docs/decisions/0081) — 저장 전에 꼭 거친다
// 출고요청에는 수령인 이름·전화·주소가 들어오므로, 칸 이름으로 찾아 가운데를 가린다
// 키 원문(X-API-Key)은 본문에 없지만, 혹시 들어오면 통째로 가린다

const PERSONAL_KEY = /(name|nm|tel|phone|mobile|hp|addr|address|email|receiver|recipient|zip|memo)/i
const SECRET_KEY = /(api.?key|secret|password|token)/i
// 업무 정보 칸은 가리지 않는다 (품목명·센터명·화주명·거래처명·단위명 — 개인정보가 아님)
// customer는 개인 구매자일 수 있어 넣지 않는다 (덜 가리는 것보다 더 가리는 쪽이 안전)
const BUSINESS_LEAF = /^(item|product|sku|center|shipper|client|partner|unit|warehouse)/i
// 부모가 업무 객체이면 그 안의 일반 칸(name 등)은 그대로: { client: { name } }·{ key: { name } }·{ centers: [{ name }] }
// 목록 껍데기(items·lines 등)는 업무 객체가 아니다 → 그 안의 receiverName은 가린다
const BUSINESS_PARENT = /^(client|key|centers?|shipper|warehouse|units?|item|product|partner)$/i
const GENERIC_LEAF = /^(name|nm|email|tel|phone|address|addr)$/i

// 글자 가운데 가리기: '홍길동' → '홍*동', '01012345678' → '010****5678', 주소는 앞 2마디만
export function maskText(key: string, value: string): string {
  if (/addr|address/i.test(key)) {
    const words = value.split(/\s+/)
    return words.length <= 2 ? '***' : `${words.slice(0, 2).join(' ')} ***`
  }
  if (/email/i.test(key)) {
    const [local, domain] = value.split('@')
    return domain ? `${local.slice(0, 2)}***@${domain}` : '***'
  }
  if (value.length <= 2) return '*'.repeat(value.length)
  const keep = value.length >= 8 ? 3 : 1
  const tail = value.length >= 8 ? 4 : 1
  return value.slice(0, keep) + '*'.repeat(value.length - keep - tail) + value.slice(-tail)
}

// JSON 값 전체를 따라가며 가린다 (원본은 그대로 두고 새 값을 돌려준다)
// 칸 이름과 그 칸을 담은 부모 이름을 함께 본다: { client: { name } }·{ key: { name } }의 name은 업무 정보라 그대로,
// { receiver: { name } }·{ receiverName }은 가린다
export function maskPersonal(value: unknown, key = '', parent = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => maskPersonal(item, key, parent))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        maskPersonal(v, k, key),
      ]),
    )
  }
  if (typeof value === 'string') {
    if (SECRET_KEY.test(key)) return '***'
    const business =
      BUSINESS_LEAF.test(key) || (GENERIC_LEAF.test(key) && BUSINESS_PARENT.test(parent))
    if (PERSONAL_KEY.test(key) && !business) return maskText(key, value)
  }
  return value
}

// 본문 글자 → 가린 JSON 글자 (JSON이 아니면 앞 200자만, 너무 길면 자른다)
export function maskBody(body: string | null, maxLength = 100_000): string | null {
  if (!body) return null
  try {
    const masked = JSON.stringify(maskPersonal(JSON.parse(body)))
    return masked.length > maxLength ? `${masked.slice(0, maxLength)}…(잘림)` : masked
  } catch {
    return `(JSON 아님) ${body.slice(0, 200)}`
  }
}
