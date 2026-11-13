import { describe, expect, it } from 'vitest'
import { computePermissions, type PermissionInput } from './compute-permissions'

const base: PermissionInput = {
  userType: 'CENTER',
  isActive: true,
  groupCodes: [],
  grants: [],
  denies: [],
}

const codesOf = (input: Partial<PermissionInput>) =>
  [...computePermissions({ ...base, ...input }).codes].sort()

describe('최종 권한 계산', () => {
  it('기본 공식: 그룹 권한 + 사용자 추가 − 사용자 제외', () => {
    expect(
      codesOf({
        groupCodes: ['inbound.asn.read', 'inbound.inspection.read', 'inbound.inspection.update'],
        grants: ['inbound.confirm.read', 'inbound.confirm.confirm'],
        denies: ['inbound.inspection.update'],
      }),
    ).toEqual([
      'inbound.asn.read',
      'inbound.confirm.confirm',
      'inbound.confirm.read',
      'inbound.inspection.read',
    ])
  })

  it('1. 그룹에 있어도 제외가 이긴다', () => {
    expect(
      codesOf({ groupCodes: ['stock.inventory.read'], denies: ['stock.inventory.read'] }),
    ).toEqual([])
  })

  it('2. 여러 그룹의 같은 권한은 하나로 합친다', () => {
    expect(
      codesOf({
        groupCodes: ['stock.inventory.read', 'stock.inventory.read', 'stock.history.read'],
      }),
    ).toEqual(['stock.history.read', 'stock.inventory.read'])
  })

  it('3. 목록에 없는 옛 코드는 무시하고 따로 알려준다', () => {
    const result = computePermissions({
      ...base,
      groupCodes: ['stock.inventory.read', 'stock.old-menu.read', 'stock.old-menu.read'],
    })
    expect([...result.codes]).toEqual(['stock.inventory.read'])
    expect(result.ignored).toEqual([{ code: 'stock.old-menu.read', reason: 'unknown' }])
  })

  it('4. 화주사 사용자에게 운영사 화면 권한은 생기지 않는다 (그룹을 잘못 넣어도)', () => {
    const result = computePermissions({
      ...base,
      userType: 'SHIPPER',
      groupCodes: ['portal.asn.read', 'inbound.asn.read', 'system.users.read'],
    })
    expect([...result.codes]).toEqual(['portal.asn.read'])
    expect(result.ignored.map((i) => [i.code, i.reason])).toEqual([
      ['inbound.asn.read', 'other-area'],
      ['system.users.read', 'other-area'],
    ])
  })

  it('4. 운영사·센터 직원에게 포털 권한은 생기지 않는다', () => {
    expect(
      codesOf({ userType: 'OPERATOR', grants: ['portal.stock.read', 'stock.inventory.read'] }),
    ).toEqual(['stock.inventory.read'])
  })

  it('5. 메뉴 조회(read) 권한이 없으면 그 메뉴의 버튼 권한도 무효', () => {
    expect(codesOf({ groupCodes: ['inbound.asn.close', 'inbound.asn.export'] })).toEqual([])
  })

  it('5. 조회를 제외하면 그 메뉴 전체가 막힌다', () => {
    expect(
      codesOf({
        groupCodes: [
          'inbound.asn.read',
          'inbound.asn.create',
          'inbound.asn.close',
          'stock.inventory.read',
        ],
        denies: ['inbound.asn.read'],
      }),
    ).toEqual(['stock.inventory.read'])
  })

  it('6. 사용 중지 계정은 권한이 없다', () => {
    expect(codesOf({ isActive: false, groupCodes: ['stock.inventory.read'] })).toEqual([])
  })

  it('그룹이 없어도 사용자 추가 권한만으로 권한이 생긴다', () => {
    expect(codesOf({ grants: ['stock.history.read'] })).toEqual(['stock.history.read'])
  })

  it('그룹도 추가도 없으면 권한이 없다', () => {
    expect(codesOf({})).toEqual([])
  })

  it('제외 목록의 옛 코드도 무시 목록에 알린다 (계산에는 영향 없음)', () => {
    const result = computePermissions({ ...base, denies: ['gone.menu.read'] })
    expect(result.ignored).toEqual([{ code: 'gone.menu.read', reason: 'unknown' }])
  })

  it('7. 시스템 메뉴(사용자·권한그룹)는 운영사 사용자만 가진다 (권한 상승 방지)', () => {
    const groupCodes = [
      'system.users.read',
      'system.roles.read',
      'system.roles.update',
      'stock.inventory.read',
    ]
    const center = computePermissions({ ...base, userType: 'CENTER', groupCodes })
    expect([...center.codes]).toEqual(['stock.inventory.read'])
    expect(center.ignored.map((i) => i.reason)).toEqual([
      'operator-only',
      'operator-only',
      'operator-only',
    ])

    expect(codesOf({ userType: 'OPERATOR', groupCodes })).toEqual([
      'stock.inventory.read',
      'system.roles.read',
      'system.roles.update',
      'system.users.read',
    ])
  })

  it('7. 센터 직원에게 개별 추가(GRANT)로 줘도 시스템 권한은 생기지 않는다', () => {
    expect(
      codesOf({ userType: 'CENTER', grants: ['system.users.read', 'system.users.create'] }),
    ).toEqual([])
  })
})
