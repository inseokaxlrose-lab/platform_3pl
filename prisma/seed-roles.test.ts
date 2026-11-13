import { describe, expect, it } from 'vitest'
import { computePermissions } from '../src/lib/permissions/compute-permissions'
import { SAMPLE_ACCOUNTS, SEED_GROUPS } from './seed-roles'

const groupOf = (name: string) => SEED_GROUPS.find((g) => g.name === name)!

describe('시드 역할별 권한 정의', () => {
  it('견본 계정마다 시드가 관리하는 그룹이 있고, 그룹 영역이 사용자 유형과 맞다', () => {
    for (const account of SAMPLE_ACCOUNTS) {
      const group = groupOf(account.group)
      expect(group, account.username).toBeDefined()
      expect(group.area).toBe(account.userType === 'SHIPPER' ? 'PORTAL' : 'ADMIN')
    }
  })

  // 계산에서 빠지는 코드가 있으면 정의가 잘못된 것 (조회 누락·다른 영역·시스템 권한 섞임)
  it('권한 계산을 거쳐도 하나도 빠지지 않는다', () => {
    for (const account of SAMPLE_ACCOUNTS) {
      const { codes } = groupOf(account.group)
      const result = computePermissions({
        userType: account.userType,
        isActive: true,
        groupCodes: codes,
        grants: [],
        denies: [],
      })
      expect(result.ignored, account.username).toEqual([])
      expect([...result.codes].sort(), account.username).toEqual([...new Set(codes)].sort())
    }
  })

  it('역할 구분: 시스템 메뉴는 운영사 관리자만, 실사 확정은 센터 운영자까지', () => {
    const has = (group: string, code: string) =>
      (groupOf(group).codes as readonly string[]).includes(code)

    expect(has('센터 운영자', 'system.users.read')).toBe(false)
    expect(has('센터 운영자', 'stock.adjustments.confirm')).toBe(true)
    expect(has('센터 작업자', 'stock.adjustments.create')).toBe(true)
    expect(has('센터 작업자', 'stock.adjustments.confirm')).toBe(false)
    expect(has('센터 작업자', 'master.items.create')).toBe(false)
  })
})
