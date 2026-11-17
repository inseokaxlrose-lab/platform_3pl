import { beforeAll, describe, expect, it } from 'vitest'
import { generateApiKey, hashApiKey, isSameHash, maskedKey, parseApiKey } from './api-key'
import { isIpAllowed, isValidCidr } from './ip-allow'
import { maskBody, maskPersonal } from './mask'

beforeAll(() => {
  // 테스트용 비밀값 (실제 .env 값과 상관없이)
  process.env.API_KEY_SECRET = 'test-secret-for-api-key-hash-0123456789'
})

describe('API 키 (0081)', () => {
  it('형식 {환경}_{식별부 8자}_{비밀부 40자}, 해시만 비교한다', () => {
    const { fullKey, prefix, hash } = generateApiKey('LIVE')
    expect(fullKey).toMatch(/^live_[a-z0-9]{8}_[A-Za-z0-9]{40}$/)
    expect(fullKey.length).toBeGreaterThanOrEqual(40)
    expect(parseApiKey(fullKey)).toEqual({ env: 'LIVE', prefix })
    expect(hash).toHaveLength(64)
    expect(hash).toBe(hashApiKey(fullKey))
    expect(isSameHash(fullKey, hash)).toBe(true)
    expect(isSameHash(`${fullKey.slice(0, -1)}x`, hash)).toBe(false)
    expect(maskedKey('LIVE', prefix)).toBe(`live_${prefix}_••••`)
  })

  it('형식이 틀리면 null, 매번 다른 키', () => {
    expect(parseApiKey(null)).toBeNull()
    expect(parseApiKey('live_short_x')).toBeNull()
    expect(parseApiKey('prod_abcdefgh_' + 'a'.repeat(40))).toBeNull()
    expect(parseApiKey(' test_abcdefgh_' + 'A'.repeat(40) + ' ')).toEqual({
      env: 'TEST',
      prefix: 'abcdefgh',
    })
    expect(generateApiKey('TEST').fullKey).not.toBe(generateApiKey('TEST').fullKey)
  })
})

describe('허용 IP', () => {
  it('목록이 비면 모두 허용, 단일 IP·CIDR·IPv6', () => {
    expect(isIpAllowed('1.2.3.4', [])).toBe(true)
    expect(isIpAllowed('203.0.113.7', ['203.0.113.0/24'])).toBe(true)
    expect(isIpAllowed('203.0.114.7', ['203.0.113.0/24'])).toBe(false)
    expect(isIpAllowed('10.0.0.1', ['10.0.0.1'])).toBe(true)
    expect(isIpAllowed('::ffff:10.0.0.1', ['10.0.0.1'])).toBe(true)
    expect(isIpAllowed('2001:db8::1', ['2001:db8::/32'])).toBe(true)
    expect(isIpAllowed('2001:db9::1', ['2001:db8::/32'])).toBe(false)
    expect(isIpAllowed(null, ['10.0.0.1'])).toBe(false)
  })

  it('입력 검사', () => {
    expect(isValidCidr('192.168.0.0/16')).toBe(true)
    expect(isValidCidr('192.168.0.256')).toBe(false)
    expect(isValidCidr('10.0.0.0/33')).toBe(false)
    expect(isValidCidr('2001:db8::/129')).toBe(false)
    expect(isValidCidr('abc')).toBe(false)
  })
})

describe('로그 개인정보 가리기', () => {
  it('수령인 이름·전화·주소·이메일은 가리고, 품목명·코드는 그대로', () => {
    expect(
      maskPersonal({
        orderNo: 'ORD-1',
        receiverName: '홍길동',
        receiverTel: '01012345678',
        address: '서울특별시 강남구 테헤란로 123',
        email: 'hong@example.com',
        lines: [{ itemCd: 'A1', itemName: '생수 2L', qty: 3 }],
        apiKey: 'live_x',
      }),
    ).toEqual({
      orderNo: 'ORD-1',
      receiverName: '홍*동',
      receiverTel: '010****5678',
      address: '서울특별시 강남구 ***',
      email: 'ho***@example.com',
      lines: [{ itemCd: 'A1', itemName: '생수 2L', qty: 3 }],
      apiKey: '***',
    })
    expect(maskBody('not json')).toBe('(JSON 아님) not json')
    expect(maskBody(null)).toBeNull()
  })
})
