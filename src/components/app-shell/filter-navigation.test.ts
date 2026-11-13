import { describe, expect, it } from 'vitest'
import { navigation } from '@/config/navigation'
import type { PermissionCode } from '@/config/permissions'
import { filterNavigation } from './filter-navigation'

const titlesOf = (codes: PermissionCode[]) =>
  filterNavigation(navigation.admin, new Set(codes)).groups.map((group) => ({
    label: group.label ?? '(홈)',
    items: group.items.map((item) => item.title),
  }))

describe('filterNavigation', () => {
  it('권한이 없으면 홈만 보인다', () => {
    expect(titlesOf([])).toEqual([{ label: '(홈)', items: ['홈'] }])
  })

  it('권한 있는 메뉴만 보이고, 메뉴가 남지 않은 묶음은 숨긴다', () => {
    expect(titlesOf(['inbound.asn.read', 'stock.inventory.read', 'stock.history.read'])).toEqual([
      { label: '(홈)', items: ['홈'] },
      { label: '입고', items: ['ASN 조회'] },
      { label: '재고', items: ['재고 조회', '재고 이력'] },
    ])
  })

  it('"ASN 등록" 메뉴는 등록(create) 권한으로 보인다', () => {
    const inbound = titlesOf(['inbound.asn.read', 'inbound.asn.create']).find(
      (group) => group.label === '입고',
    )
    expect(inbound?.items).toEqual(['ASN 등록', 'ASN 조회'])
  })

  it('원래 메뉴 목록은 바꾸지 않는다', () => {
    const before = JSON.stringify(navigation.admin.groups.map((g) => g.items.length))
    filterNavigation(navigation.admin, new Set())
    expect(JSON.stringify(navigation.admin.groups.map((g) => g.items.length))).toBe(before)
  })
})
