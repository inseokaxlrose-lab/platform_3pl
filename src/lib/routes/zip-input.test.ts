import { describe, expect, it } from 'vitest'
import { parseZipInput } from './zip-input'

// 코스 우편번호 붙여넣기 (0095)
describe('우편번호 붙여넣기 해석', () => {
  it('쉼표·줄바꿈·띄어쓰기로 나누고, 겹친 것은 하나로, 순서대로', () => {
    expect(parseZipInput('16300, 06236\n16300  16301')).toEqual({
      zips: ['06236', '16300', '16301'],
      invalid: [],
    })
  })

  it('범위(- 또는 ~)는 펼친다, 앞자리 0도 지킨다', () => {
    expect(parseZipInput('06230~06232').zips).toEqual(['06230', '06231', '06232'])
    expect(parseZipInput('16300-16302').zips).toHaveLength(3)
  })

  it('5자리가 아니거나 거꾸로·너무 큰 범위는 잘못된 값으로 돌려준다', () => {
    expect(parseZipInput('1630 16399-16300 00000-99999 abcde').invalid).toEqual([
      '1630',
      '16399-16300',
      '00000-99999',
      'abcde',
    ])
  })
})
