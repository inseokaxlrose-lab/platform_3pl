import { describe, expect, it } from 'vitest'
import { idField, idSchema, optionalIdSchema, parseId, textIds } from './id'

describe('내부 키 글자 ↔ bigint', () => {
  it('parseId: 1 이상의 정수 글자만 키로', () => {
    expect(parseId('12')).toBe(12n)
    expect(parseId('9223372036854775807')).toBe(9223372036854775807n)
    for (const bad of [
      '',
      '0',
      '012',
      '-1',
      '1.5',
      'abc',
      '9223372036854775808',
      null,
      undefined,
    ]) {
      expect(parseId(bad)).toBeNull()
    }
  })

  it('idSchema: 글자를 받아 bigint로, 틀리면 문구', () => {
    expect(idSchema.parse('7')).toBe(7n)
    expect(idSchema.parse(' 7 ')).toBe(7n)
    const result = idSchema.safeParse('x')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('잘못된 키입니다.')
    expect(idSchema.safeParse('0').success).toBe(false)
    expect(idField('센터를 골라 주세요.').safeParse('').error?.issues[0].message).toBe(
      '센터를 골라 주세요.',
    )
  })

  it('optionalIdSchema: 빈 글자·null은 null', () => {
    expect(optionalIdSchema.parse('')).toBeNull()
    expect(optionalIdSchema.parse(null)).toBeNull()
    expect(optionalIdSchema.parse('3')).toBe(3n)
  })
})

describe('textIds: 화면으로 보낼 값의 키를 글자로', () => {
  it('객체·배열 안의 bigint를 모두 글자로, 날짜·null은 그대로', () => {
    const date = new Date('2026-11-15T00:00:00Z')
    const result = textIds({
      id: 3n,
      name: 'A',
      at: date,
      none: null,
      list: [{ id: 1n }, { id: 2n }],
    })
    expect(result).toEqual({
      id: '3',
      name: 'A',
      at: date,
      none: null,
      list: [{ id: '1' }, { id: '2' }],
    })
    expect(result.at).toBe(date)
  })
})
