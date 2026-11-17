// 허용 IP 검사 (docs/decisions/0081) — 화면·서버 공용 순수 함수
// 값은 단일 IP 또는 CIDR (IPv4 '203.0.113.0/24', IPv6 '2001:db8::/32'). 목록이 비어 있으면 모두 허용

// IPv4 → 32비트 수, IPv6 → 128비트 수 (BigInt). 잘못된 글자면 null
function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0n
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null
    value = (value << 8n) + BigInt(part)
  }
  return value
}

function ipv6ToBigInt(ip: string): bigint | null {
  if (!/^[0-9a-f:]+$/i.test(ip) || ip.split('::').length > 2) return null
  const [head, tail = ''] = ip.split('::')
  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const missing = 8 - headParts.length - tailParts.length
  if (missing < 0 || (!ip.includes('::') && missing !== 0)) return null
  const parts = [...headParts, ...Array<string>(missing).fill('0'), ...tailParts]
  let value = 0n
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null
    value = (value << 16n) + BigInt(`0x${part}`)
  }
  return value
}

type Parsed = { version: 4 | 6; value: bigint }

// IPv4가 IPv6 모양으로 온 경우(::ffff:1.2.3.4)는 IPv4로 본다
export function parseIp(raw: string): Parsed | null {
  const ip = raw.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '')
  const v4 = ipv4ToBigInt(ip)
  if (v4 !== null) return { version: 4, value: v4 }
  const v6 = ipv6ToBigInt(ip)
  return v6 !== null ? { version: 6, value: v6 } : null
}

// '203.0.113.0/24' → 주소·길이 (단일 IP는 길이 = 전체). 잘못된 글자면 null
export function parseCidr(raw: string): (Parsed & { bits: number }) | null {
  const [ip, bitsText] = raw.trim().split('/')
  const parsed = parseIp(ip)
  if (!parsed) return null
  const max = parsed.version === 4 ? 32 : 128
  if (bitsText === undefined) return { ...parsed, bits: max }
  if (!/^\d{1,3}$/.test(bitsText) || Number(bitsText) > max) return null
  return { ...parsed, bits: Number(bitsText) }
}

export const isValidCidr = (raw: string) => parseCidr(raw) !== null

// 이 IP가 허용 목록 안에 있는지 (목록이 비어 있으면 true)
export function isIpAllowed(ip: string | null, allowList: readonly string[]): boolean {
  if (allowList.length === 0) return true
  const parsed = ip ? parseIp(ip) : null
  if (!parsed) return false
  return allowList.some((entry) => {
    const range = parseCidr(entry)
    if (!range || range.version !== parsed.version) return false
    const max = range.version === 4 ? 32n : 128n
    const shift = max - BigInt(range.bits)
    return parsed.value >> shift === range.value >> shift
  })
}
