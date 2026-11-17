import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bjdLevel,
  decodeKorean,
  mainSigunguCode,
  parseAddressLine,
  parseBjdFile,
  representativeAddress,
  ZipAggregator,
} from './region-files'

// 지역 마스터 원본 파일 해석 (docs/decisions/0076)

const FIXTURE = 'src/test/fixtures/region'
const bjdText = decodeKorean(readFileSync(`${FIXTURE}/bjd-sample.csv`))

describe('법정동코드 파일', () => {
  it('CP949 CSV를 읽고, 단계와 시도·시군구·읍면동·리 이름을 위 단계 기록에서 이어 받는다', () => {
    const rows = parseBjdFile(bjdText)
    const byCode = new Map(rows.map((r) => [r.code, r]))
    expect(byCode.get('4111313600')).toMatchObject({
      level: 3,
      sidoName: '경기도',
      sigunguCode: '41113',
      sigunguName: '수원시 권선구',
      emdName: '호매실동',
      riName: null,
      abolished: false,
    })
    expect(byCode.get('4150025021')).toMatchObject({
      level: 4,
      sigunguName: '이천시',
      emdName: '마장면',
      riName: '이치리',
    })
    expect(byCode.get('1168010200')?.abolished).toBe(true)
    // 세종: 시군구 기록 이름이 시도와 같아 시군구 이름은 비운다
    expect(byCode.get('3611010100')).toMatchObject({ sidoName: '세종특별자치시', sigunguName: '' })
    expect([bjdLevel('4100000000'), bjdLevel('4111300000')]).toEqual([1, 2])
  })

  it('머리줄에 필요한 열이 없거나 코드가 10자리가 아니면 알려 준다', () => {
    expect(() => parseBjdFile('코드,이름\n1,가')).toThrow(/법정동코드/)
    expect(() => parseBjdFile('법정동코드,법정동명,폐지여부\n12345,가,존재')).toThrow(/2번째 줄/)
  })
})

describe('주소DB 파일', () => {
  const lines = readFileSync(`${FIXTURE}/address-sample.txt`, 'utf-8').trim().split('\n')

  it('우편번호별로 주소 수·법정동별 주소 수·대표 주소를 모은다 (경계 우편번호는 법정동 2개)', () => {
    const agg = new ZipAggregator()
    lines.forEach((line, i) => {
      const row = parseAddressLine(line, i + 1)
      if (row) agg.add(row)
    })
    const zip = agg.zips.get('16613')!
    expect(zip).toMatchObject({ sidoCode: '41', sigunguCode: '41113', addressCount: 4 })
    expect(representativeAddress(zip)).toBe('권선로 300~420, 세권로 88')
    expect([...agg.zips.get('16625')!.bjdCounts.entries()]).toEqual([
      ['4111313700', 2],
      ['4111313600', 1],
    ])
    expect(agg.crossSigungu.size).toBe(0)
  })

  it('시군구를 넘는 우편번호는 주소가 가장 많은 시군구로 정한다 (처음 읽은 줄이 아니라)', () => {
    const agg = new ZipAggregator()
    const line = (bjd: string, n: number) =>
      `M${n}|${bjd}|경기도|고양시|동||0|1|0|R|길|0|${n}|0|${bjd}|동|10457||20200101|0||||`
    // 일산동구(41285) 1곳이 먼저, 덕양구(41281) 3곳이 뒤에
    ;[line('4128510100', 1), line('4128110100', 2), line('4128110100', 3), line('4128110200', 4)]
      .map((l, i) => parseAddressLine(l, i + 1)!)
      .forEach((row) => agg.add(row))
    const zip = agg.zips.get('10457')!
    expect(agg.crossSigungu.has('10457')).toBe(true)
    expect(mainSigunguCode(zip)).toBe('41281')
  })

  it('열 모양이 다르면 줄 번호와 함께 알려 준다', () => {
    expect(() => parseAddressLine('a|b|c', 7)).toThrow(/7번째 줄/)
    expect(parseAddressLine('  ', 1)).toBeNull()
  })
})
