import { describe, expect, it } from 'vitest'
import {
  EMPTY_OVERRIDES,
  nextOverrideState,
  overridableCodes,
  overridesIssue,
  overrideStateOf,
  setOverrideState,
} from './override-state'

describe('사용자별 추가·제외 권한 상태', () => {
  it('칸을 누를 때마다 그룹대로 → 추가 → 제외 → 그룹대로로 돈다', () => {
    expect(nextOverrideState('inherit')).toBe('grant')
    expect(nextOverrideState('grant')).toBe('deny')
    expect(nextOverrideState('deny')).toBe('inherit')
  })

  it('상태를 바꾸면 추가·제외 중 한 곳에만 들어가고, 원래 값은 그대로다', () => {
    const granted = setOverrideState(EMPTY_OVERRIDES, 'master.items.create', 'grant')
    expect(granted).toEqual({ grants: ['master.items.create'], denies: [] })
    expect(EMPTY_OVERRIDES).toEqual({ grants: [], denies: [] })

    const denied = setOverrideState(granted, 'master.items.create', 'deny')
    expect(denied).toEqual({ grants: [], denies: ['master.items.create'] })
    expect(overrideStateOf(denied, 'master.items.create')).toBe('deny')

    const back = setOverrideState(denied, 'master.items.create', 'inherit')
    expect(back).toEqual(EMPTY_OVERRIDES)
    expect(overrideStateOf(back, 'master.items.create')).toBe('inherit')
  })

  it('추가·제외할 수 있는 코드: 자기 영역만, 시스템 메뉴는 운영사만', () => {
    const operator = overridableCodes('OPERATOR')
    const center = overridableCodes('CENTER')
    const shipper = overridableCodes('SHIPPER')

    expect(operator).toContain('system.users.update')
    expect(center).toContain('master.items.create')
    expect(center).not.toContain('system.users.update')
    expect(center.some((c) => c.startsWith('portal.'))).toBe(false)
    expect(shipper.every((c) => c.startsWith('portal.'))).toBe(true)
  })

  it('저장 전 검사: 모르는 코드·다른 영역·시스템 권한·추가와 제외 중복을 거부한다', () => {
    expect(overridesIssue('CENTER', ['master.items.create'], ['master.items.delete'])).toBeNull()
    expect(overridesIssue('CENTER', ['old.code'], [])).toMatch(/알 수 없는/)
    expect(overridesIssue('CENTER', ['portal.stock.read'], [])).toMatch(/줄 수 없는/)
    expect(overridesIssue('CENTER', ['system.users.read'], [])).toMatch(/줄 수 없는/)
    expect(overridesIssue('SHIPPER', [], ['master.items.read'])).toMatch(/줄 수 없는/)
    expect(overridesIssue('OPERATOR', ['master.items.read'], ['master.items.read'])).toMatch(
      /동시에/,
    )
  })
})
