import { describe, expect, it } from 'vitest'
import { generateTempPassword } from './temp-password'
import { passwordSchema } from './user-schema'

// 임시 비밀번호 (0086): 12자, 헷갈리는 글자 없음, 늘 비밀번호 규칙을 통과
describe('generateTempPassword', () => {
  it('12자, 영문·숫자 포함, 0·O·o·1·l·I 없음, 규칙 통과', () => {
    for (let i = 0; i < 300; i++) {
      const password = generateTempPassword()
      expect(password).toHaveLength(12)
      expect(password).not.toMatch(/[0Oo1lI]/)
      expect(passwordSchema.safeParse(password).success).toBe(true)
    }
  })

  it('매번 다르다', () => {
    const passwords = new Set(Array.from({ length: 100 }, () => generateTempPassword()))
    expect(passwords.size).toBe(100)
  })
})
