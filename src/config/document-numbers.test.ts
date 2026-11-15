import { describe, expect, it } from 'vitest'
import { formatDocumentNumber, kstYymmdd } from './document-numbers'

describe('업무 문서 번호', () => {
  it('접두어 + 한국 시간 날짜 + 일련번호 5자리', () => {
    expect(formatDocumentNumber('ASN', 1, new Date('2026-11-16T01:00:00Z'))).toBe('AS261116-00001')
    expect(formatDocumentNumber('RECEIPT', 123456n, new Date('2026-11-16T01:00:00Z'))).toBe(
      'RC261116-123456',
    )
  })

  it('날짜는 한국 시간 기준 (UTC 15시 = 다음 날 0시)', () => {
    expect(kstYymmdd(new Date('2026-11-15T14:59:59Z'))).toBe('261115')
    expect(kstYymmdd(new Date('2026-11-15T15:00:00Z'))).toBe('261116')
  })
})
