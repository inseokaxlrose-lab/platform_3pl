import { describe, expect, it } from 'vitest'
import { isYes, toYn } from './yn'

describe('예/아니오 칸 Y/N ↔ true/false', () => {
  it('저장할 때 true → Y, false → N', () => {
    expect(toYn(true)).toBe('Y')
    expect(toYn(false)).toBe('N')
  })

  it('읽을 때 Y만 참', () => {
    expect(isYes('Y')).toBe(true)
    expect(isYes('N')).toBe(false)
    expect(isYes('')).toBe(false)
  })
})
