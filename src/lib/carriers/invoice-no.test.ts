import { describe, expect, it } from 'vitest'
import {
  bodyDigitsOf,
  checkDigitOf,
  invoiceNoOf,
  isValidInvoiceNo,
  remainingInvoices,
  trackingUrlOf,
} from './invoice-no'

// 송장번호 계산·검사 (0094)
describe('체크디지트 MOD7', () => {
  it('끝자리는 본번호를 7로 나눈 나머지', () => {
    // 12345678901 ÷ 7 = 1763668414 … 3
    expect(checkDigitOf('12345678901', 'MOD7')).toBe('3')
    expect(invoiceNoOf('12345678901', 'MOD7')).toBe('123456789013')
  })

  it('Number로는 정확하지 않은 큰 자릿수도 맞게 계산한다', () => {
    // 9007199254740993 ÷ 7 = 1286742750677284 … 5
    expect(checkDigitOf('9007199254740993', 'MOD7')).toBe('5')
  })

  it('규칙이 없으면 체크디지트를 붙이지 않는다', () => {
    expect(invoiceNoOf('1234567890123', 'NONE')).toBe('1234567890123')
  })

  it('본번호 자릿수 = 송장번호 자릿수 - 체크디지트', () => {
    expect(bodyDigitsOf(12, 'MOD7')).toBe(11)
    expect(bodyDigitsOf(13, 'NONE')).toBe(13)
    expect(bodyDigitsOf(null, 'MOD7')).toBeNull()
  })
})

describe('송장번호 검사', () => {
  const cj = { invoiceDigits: 12, invoiceCheck: 'MOD7' as const }

  it('자릿수·체크디지트가 맞아야 한다', () => {
    expect(isValidInvoiceNo('123456789013', cj)).toBe(true)
    expect(isValidInvoiceNo('123456789014', cj)).toBe(false)
    expect(isValidInvoiceNo('12345678901', cj)).toBe(false)
    expect(isValidInvoiceNo('1234-5678-9013', cj)).toBe(false)
  })

  it('규칙이 없는 운송사는 숫자인지만 본다 (자릿수를 정했으면 자릿수도)', () => {
    expect(isValidInvoiceNo('42', { invoiceDigits: null, invoiceCheck: 'NONE' })).toBe(true)
    expect(isValidInvoiceNo('42', { invoiceDigits: 13, invoiceCheck: 'NONE' })).toBe(false)
  })
})

describe('대역·조회 주소', () => {
  it('남은 송장 수: 다음 번호부터 끝 번호까지, 다 쓰면 0', () => {
    expect(remainingInvoices({ next: '60000000000', end: '60000009999' })).toBe('10000')
    expect(remainingInvoices({ next: '60000010000', end: '60000009999' })).toBe('0')
  })

  it('조회 주소의 {invoiceNo} 자리에 송장번호를 넣는다', () => {
    expect(trackingUrlOf('https://track.example/?no={invoiceNo}', '123456789013')).toBe(
      'https://track.example/?no=123456789013',
    )
    expect(trackingUrlOf(null, '1')).toBeNull()
  })
})
