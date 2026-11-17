import { describe, expect, it } from 'vitest'
import {
  buildBjdIndex,
  parseAddressText,
  sigunguScope,
  type BjdIndexRow,
} from './address-text-parse'

// 주소 글자 해석 (정제 ④·⑤단계) — 실제 2026-09 법정동 자료에서 본 경우를 작게 재현

const row = (
  code: string,
  sidoName: string,
  sigunguName = '',
  emdName: string | null = null,
  riName: string | null = null,
): BjdIndexRow => ({
  code,
  sidoCode: code.slice(0, 2),
  sidoName,
  sigunguCode: code.slice(0, 5),
  sigunguName,
  emdName,
  riName,
  level: riName ? 4 : emdName ? 3 : code.slice(2, 5) === '000' ? 1 : 2,
})

const index = buildBjdIndex([
  row('1100000000', '서울특별시'),
  row('1168000000', '서울특별시', '강남구'),
  row('1168010100', '서울특별시', '강남구', '역삼동'),
  row('1114000000', '서울특별시', '중구'),
  row('1114010100', '서울특별시', '중구', '무교동'),
  row('2600000000', '부산광역시'),
  row('2611000000', '부산광역시', '중구'),
  row('2611010100', '부산광역시', '중구', '영주동'),
  row('4100000000', '경기도'),
  row('4111000000', '경기도', '수원시'),
  row('4111300000', '경기도', '수원시 권선구'),
  row('4111312900', '경기도', '수원시 권선구', '권선동'),
  row('4111100000', '경기도', '수원시 장안구'),
  row('4161000000', '경기도', '광주시'),
  row('4150000000', '경기도', '이천시'),
  row('4150025000', '경기도', '이천시', '마장면'),
  row('4150025021', '경기도', '이천시', '마장면', '이치리'),
  // 세종: 시도 단계 기록 없이 이름 없는 시군구만
  row('3611000000', '세종특별자치시'),
  row('3611010100', '세종특별자치시', '', '반곡동'),
  // 광주·전남 통합 (옛 이름으로 쓴 주소도 받아야 한다)
  row('1200000000', '전남광주통합특별시'),
  row('1230000000', '전남광주통합특별시', '북구'),
  row('1230010700', '전남광주통합특별시', '북구', '용봉동'),
  row('1211000000', '전남광주통합특별시', '목포시'),
  // 제주: '제주시'는 시군구
  row('5000000000', '제주특별자치도'),
  row('5011000000', '제주특별자치도', '제주시'),
  row('5011013700', '제주특별자치도', '제주시', '연동'),
  // 읍면동 기록 없이 리만 있는 경우 (주소DB 이름으로 덧붙인 구지읍)
  row('2700000000', '대구광역시'),
  row('2771000000', '대구광역시', '달성군'),
  row('2771026821', '대구광역시', '달성군', '구지읍', '창리'),
])

const bjd = (bjdCode: string) => expect.objectContaining({ level: 'BJD', bjdCode })
const sigungu = (sigunguCode: string, sigunguCodes = [sigunguCode]) => ({
  level: 'SIGUNGU',
  sidoCode: sigunguCode.slice(0, 2),
  sigunguCode,
  sigunguCodes,
})

describe('parseAddressText', () => {
  it.each([
    ['서울특별시 강남구 역삼동 737', bjd('1168010100')],
    ['서울 강남구 역삼1동 테헤란로 152', bjd('1168010100')], // 행정동 → 법정동
    ['서울시 강남구 테헤란로 152 (역삼동, 강남파이낸스센터)', bjd('1168010100')], // 괄호 참고항목
    ['경기 수원시 권선구 권선동 1234-5', bjd('4111312900')],
    ['수원시 권선구 권선동 1', bjd('4111312900')], // 시도 없이
    ['경기도 수원시 권선동 1', bjd('4111312900')], // 구 없이 시 + 동
    ['경기도 이천시 마장면 이치리 123', bjd('4150025021')], // 리까지
    ['경기도 이천시 마장면 456', bjd('4150025000')],
    ['세종특별자치시 반곡동 123', bjd('3611010100')],
    ['광주광역시 북구 용봉동 1', bjd('1230010700')], // 옛 시도 이름
    ['제주시 연동 123', bjd('5011013700')], // '제주시'를 제주도로 읽지 않는다
    ['중구 영주동 60', bjd('2611010100')], // 같은 이름 시군구는 읍면동으로 가린다
    ['대구 달성군 구지읍 창리 100', bjd('2771026821')],
    ['서울 강남구 테헤란로 152', sigungu('11680')],
    ['경기도 수원시 권선로 300', sigungu('41110', ['41113', '41111'])],
    ['세종시 한누리대로 2130', sigungu('36110')],
    ['전남 목포시 백년대로 46', sigungu('12110')],
    ['경기 광주시 오포로 1', sigungu('41610')],
  ])('%s', (address, expected) => {
    expect(parseAddressText(index, address)).toEqual(expected)
  })

  it.each([
    '서울 강낭구 테헤란로 152', // 오타
    '중구 어딘가로 1', // 같은 이름 시군구를 가릴 읍면동이 없다
    '어딘가 이상한 주소',
    '',
  ])('못 정함: %s', (address) => {
    expect(parseAddressText(index, address)).toEqual({ level: 'NONE' })
  })
})

describe('sigunguScope', () => {
  it('구가 있는 시는 그 아래 구 전부, 아니면 자기 자신', () => {
    expect(sigunguScope(index, '41110').sort()).toEqual(['41111', '41113'])
    expect(sigunguScope(index, '11680')).toEqual(['11680'])
    expect(sigunguScope(index, '99999')).toEqual(['99999'])
  })
})
