import { describe, expect, it } from 'vitest'
import { formatCorpRegNumber, isValidCorpRegNumber } from './corp-reg-number'

// 검증번호가 맞는 가상의 번호 (실제 법인 번호 아님)
const VALID = '1101111111113'

describe('법인등록번호', () => {
  it('검증번호가 맞으면 통과, 틀리거나 자릿수·글자가 다르면 거부', () => {
    expect(isValidCorpRegNumber(VALID)).toBe(true)
    expect(isValidCorpRegNumber('110111-1111113')).toBe(true)
    expect(isValidCorpRegNumber('1101111111112')).toBe(false)
    expect(isValidCorpRegNumber('110111111111')).toBe(false)
    expect(isValidCorpRegNumber('110111-111111a')).toBe(false)
  })

  it('000000-0000000 모양으로 (입력 중인 값도)', () => {
    expect(formatCorpRegNumber(VALID)).toBe('110111-1111113')
    expect(formatCorpRegNumber('110111')).toBe('110111')
    expect(formatCorpRegNumber('1101112')).toBe('110111-2')
  })
})
