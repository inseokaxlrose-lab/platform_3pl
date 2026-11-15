import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { exactlyOne, optionalPhone, requireOneOf } from './common-fields'

describe('여러 칸 규칙', () => {
  const contact = z
    .object({ phone: z.string(), email: z.string() })
    .superRefine(requireOneOf(['phone', 'email'], '연락처와 이메일 중 하나는 입력해 주세요.'))

  it('둘 중 하나 필수: 둘 다 비면 첫 칸에 오류', () => {
    expect(contact.safeParse({ phone: '', email: 'a@b.c' }).success).toBe(true)
    const failed = contact.safeParse({ phone: ' ', email: '' })
    expect(failed.success).toBe(false)
    expect(failed.error!.issues[0]).toMatchObject({ path: ['phone'] })
  })

  it('하나만 고르기: 행이 있으면 정확히 1개, 없으면 통과', () => {
    const list = z
      .array(z.object({ isPrimary: z.boolean() }))
      .superRefine(exactlyOne('isPrimary', '대표를 1명 정해 주세요.'))
    expect(list.safeParse([]).success).toBe(true)
    expect(list.safeParse([{ isPrimary: true }, { isPrimary: false }]).success).toBe(true)
    expect(list.safeParse([{ isPrimary: false }]).success).toBe(false)
    expect(list.safeParse([{ isPrimary: true }, { isPrimary: true }]).success).toBe(false)
  })

  it('전화번호는 숫자만 저장', () => {
    expect(optionalPhone.parse('02-123-4567')).toBe('021234567')
    expect(optionalPhone.parse('')).toBeNull()
  })
})
