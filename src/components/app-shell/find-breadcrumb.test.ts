import { HouseIcon } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import type { NavArea } from '@/config/navigation'
import { findBreadcrumb } from './find-breadcrumb'

const area: NavArea = {
  title: '운영사 화면',
  homeHref: '/admin',
  groups: [
    { items: [{ title: '홈', href: '/admin', icon: HouseIcon, ready: true, exact: true }] },
    {
      label: '입고',
      items: [
        { title: 'ASN 등록', href: '/admin/inbound/asn/new', icon: HouseIcon, ready: true },
        { title: 'ASN 조회', href: '/admin/inbound/asn', icon: HouseIcon, ready: true },
      ],
    },
  ],
}

describe('findBreadcrumb', () => {
  it('홈에서는 영역 이름만 보여준다', () => {
    expect(findBreadcrumb('/admin', area)).toEqual([{ label: '운영사 화면' }])
  })

  it('메뉴 화면에서는 영역 › 묶음 › 메뉴 순서로 보여준다', () => {
    expect(findBreadcrumb('/admin/inbound/asn', area)).toEqual([
      { label: '운영사 화면', href: '/admin' },
      { label: '입고' },
      { label: 'ASN 조회' },
    ])
  })

  it('메뉴의 하위 화면에서는 메뉴 이름을 링크로 둔다', () => {
    expect(findBreadcrumb('/admin/inbound/asn/123', area)).toEqual([
      { label: '운영사 화면', href: '/admin' },
      { label: '입고' },
      { label: 'ASN 조회', href: '/admin/inbound/asn' },
    ])
  })

  it('더 구체적인 메뉴(ASN 등록)를 우선한다', () => {
    expect(findBreadcrumb('/admin/inbound/asn/new', area).at(-1)).toEqual({ label: 'ASN 등록' })
  })

  it('메뉴에 없는 주소는 영역 이름만 보여준다', () => {
    expect(findBreadcrumb('/admin/unknown', area)).toEqual([{ label: '운영사 화면' }])
  })
})
