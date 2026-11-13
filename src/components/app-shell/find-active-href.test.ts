import { describe, expect, it } from 'vitest'
import { findActiveHref } from './find-active-href'

const items = [
  { href: '/admin', exact: true },
  { href: '/admin/inbound/asn' },
  { href: '/admin/inbound/asn/new' },
  { href: '/admin/stock' },
  { href: '/admin/stock/history' },
]

describe('findActiveHref', () => {
  it('주소가 정확히 같은 메뉴를 고른다', () => {
    expect(findActiveHref('/admin/stock', items)).toBe('/admin/stock')
  })

  it('하위 주소는 상위 메뉴로 본다', () => {
    expect(findActiveHref('/admin/inbound/asn/123', items)).toBe('/admin/inbound/asn')
  })

  it('여러 메뉴가 해당하면 가장 구체적인 메뉴 하나만 고른다', () => {
    expect(findActiveHref('/admin/inbound/asn/new', items)).toBe('/admin/inbound/asn/new')
    expect(findActiveHref('/admin/stock/history', items)).toBe('/admin/stock/history')
  })

  it('홈(exact)은 주소가 정확히 같을 때만 고른다', () => {
    expect(findActiveHref('/admin', items)).toBe('/admin')
    expect(findActiveHref('/admin/unknown', items)).toBeNull()
  })

  it('이름 앞부분만 같은 주소는 해당하지 않는다', () => {
    expect(findActiveHref('/admin/stocks', items)).toBeNull()
  })
})
