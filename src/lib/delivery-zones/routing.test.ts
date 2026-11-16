import { describe, expect, it } from 'vitest'
import { describeOverlaps, matchRegion, pickDeliveryZone, type ZoneCandidate } from './routing'

// 배송 센터 자동 배정 규칙 (0072) — 서울센터 = 서울 전체, 경기센터 = 경기 + 서울 강남구
const SEOUL: ZoneCandidate = {
  zoneId: '1',
  zoneName: '서울권역',
  centerId: '10',
  centerName: '서울센터',
  matchedRegion: '11',
  priority: 100,
}
const GANGNAM: ZoneCandidate = {
  zoneId: '2',
  zoneName: '서울남부',
  centerId: '20',
  centerName: '경기센터',
  matchedRegion: '11680',
  priority: 100,
}

describe('주소에 맞는 권역 지역', () => {
  it('시·군·구가 있으면 그것, 없으면 시·도 전체', () => {
    expect(matchRegion(['11', '11680'], '1168010100')).toBe('11680')
    expect(matchRegion(['11'], '1174010100')).toBe('11')
    expect(matchRegion(['41'], '1168010100')).toBeNull()
  })
})

describe('후보 고르기', () => {
  it('더 구체적인 지역(시·군·구)이 시·도 전체보다 먼저', () => {
    expect(pickDeliveryZone([SEOUL, GANGNAM]).picked).toEqual(GANGNAM)
  })

  it('같은 수준이면 우선순위 번호가 작은 쪽, 같으면 배정 대기(동률 후보)', () => {
    const other = { ...GANGNAM, zoneId: '3', centerId: '30', centerName: '인천센터' }
    expect(pickDeliveryZone([GANGNAM, { ...other, priority: 50 }]).picked?.centerId).toBe('30')
    expect(pickDeliveryZone([GANGNAM, other])).toEqual({ picked: null, tied: [GANGNAM, other] })
  })

  it('후보가 없으면 없음, 하나면 그것', () => {
    expect(pickDeliveryZone([])).toEqual({ picked: null, tied: [] })
    expect(pickDeliveryZone([SEOUL]).picked).toEqual(SEOUL)
  })
})

describe('배송권역 화면 겹침 안내', () => {
  it('서울 전체 권역 입장: 강남구는 상대가 우선 / 강남구 권역 입장: 이 권역이 우선 / 같은 수준·같은 번호는 배정 대기', () => {
    const fromSeoul = describeOverlaps({ regionCodes: ['11'], priority: 100 }, [
      { regionCode: '11680', zoneName: '서울남부', centerName: '경기센터', priority: 100 },
    ])
    expect(fromSeoul).toMatchObject([{ region: '11680', winner: 'OTHER' }])

    const fromGangnam = describeOverlaps({ regionCodes: ['41', '11680'], priority: 100 }, [
      { regionCode: '11', zoneName: '서울권역', centerName: '서울센터', priority: 100 },
    ])
    expect(fromGangnam).toMatchObject([
      { region: '11680', winner: 'THIS', label: '서울특별시 강남구' },
    ])

    const tie = describeOverlaps({ regionCodes: ['11680'], priority: 100 }, [
      { regionCode: '11680', zoneName: '강남', centerName: '인천센터', priority: 100 },
    ])
    expect(tie[0]).toMatchObject({ winner: 'TIE', message: expect.stringContaining('배정 대기') })
  })
})
