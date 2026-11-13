import { describe, expect, it } from 'vitest'
import type { PermissionCode } from '@/config/permissions'
import { menusCheckState, toggleMenus, togglePermission } from './permission-toggle'

const sorted = (codes: PermissionCode[]) => [...codes].sort()

describe('권한 체크 규칙', () => {
  it('버튼 권한을 체크하면 조회도 체크된다', () => {
    expect(sorted(togglePermission([], 'inbound.asn', 'close', true))).toEqual([
      'inbound.asn.close',
      'inbound.asn.read',
    ])
  })

  it('조회를 해제하면 그 메뉴 전체가 해제된다 (다른 메뉴는 그대로)', () => {
    const codes: PermissionCode[] = [
      'inbound.asn.read',
      'inbound.asn.close',
      'stock.inventory.read',
    ]
    expect(togglePermission(codes, 'inbound.asn', 'read', false)).toEqual(['stock.inventory.read'])
  })

  it('버튼 권한만 해제하면 조회는 남는다', () => {
    const codes: PermissionCode[] = ['inbound.asn.read', 'inbound.asn.close']
    expect(togglePermission(codes, 'inbound.asn', 'close', false)).toEqual(['inbound.asn.read'])
  })

  it('줄·묶음 전체 체크/해제', () => {
    const all = toggleMenus([], ['inbound.labels', 'inbound.putaway'], true)
    expect(sorted(all)).toEqual([
      'inbound.labels.print',
      'inbound.labels.read',
      'inbound.putaway.confirm',
      'inbound.putaway.read',
    ])
    expect(toggleMenus(all, ['inbound.labels'], false).sort()).toEqual([
      'inbound.putaway.confirm',
      'inbound.putaway.read',
    ])
  })

  it('체크 상태: 전부 / 일부 / 없음', () => {
    expect(menusCheckState([], ['inbound.labels'])).toBe(false)
    expect(menusCheckState(['inbound.labels.read'], ['inbound.labels'])).toBe('indeterminate')
    expect(
      menusCheckState(['inbound.labels.read', 'inbound.labels.print'], ['inbound.labels']),
    ).toBe(true)
  })

  it('원래 배열은 바꾸지 않는다', () => {
    const codes: PermissionCode[] = ['inbound.asn.read']
    togglePermission(codes, 'inbound.asn', 'close', true)
    expect(codes).toEqual(['inbound.asn.read'])
  })
})
