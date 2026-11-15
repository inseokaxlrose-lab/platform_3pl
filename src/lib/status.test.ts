import { describe, expect, it } from 'vitest'
import { isActiveStatus, toStatus } from './status'

describe('기준정보 상태 ↔ 사용 여부', () => {
  it('저장할 때 true → ACTIVE, false → INACTIVE', () => {
    expect(toStatus(true)).toBe('ACTIVE')
    expect(toStatus(false)).toBe('INACTIVE')
  })

  it('읽을 때 ACTIVE만 사용 중', () => {
    expect(isActiveStatus('ACTIVE')).toBe(true)
    expect(isActiveStatus('INACTIVE')).toBe(false)
    expect(isActiveStatus('')).toBe(false)
  })
})
