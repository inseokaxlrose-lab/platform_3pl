import { describe, expect, it } from 'vitest'
import { parseHolidayResponse } from './holiday-api'

// 공휴일 API 응답 해석 (0096): 여러 건 / 한 건(배열 아님) / 0건(빈 글자) / 인증 오류(XML)
const ok = (items: unknown) =>
  JSON.stringify({
    response: {
      header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
      body: { items, numOfRows: 100, pageNo: 1, totalCount: 0 },
    },
  })

describe('parseHolidayResponse', () => {
  it('공휴일(isHoliday=Y)만 날짜·이름으로 바꾼다', () => {
    const result = parseHolidayResponse(
      ok({
        item: [
          { dateKind: '01', dateName: '1월1일', isHoliday: 'Y', locdate: 20270101, seq: 1 },
          { dateKind: '01', dateName: '설날', isHoliday: 'Y', locdate: 20270207, seq: 1 },
          { dateKind: '01', dateName: '제헌절', isHoliday: 'N', locdate: 20270717, seq: 1 },
        ],
      }),
      2027,
    )
    expect(result).toEqual({
      status: 'OK',
      holidays: [
        { date: '2027-01-01', name: '1월1일' },
        { date: '2027-02-07', name: '설날' },
      ],
    })
  })

  it('한 건이면 item이 배열이 아니어도 읽고, 다른 연도는 버린다', () => {
    const one = parseHolidayResponse(
      ok({ item: { dateName: '크리스마스', isHoliday: 'Y', locdate: '20271225' } }),
      2027,
    )
    expect(one).toEqual({ status: 'OK', holidays: [{ date: '2027-12-25', name: '크리스마스' }] })
    const other = parseHolidayResponse(
      ok({ item: { dateName: '1월1일', isHoliday: 'Y', locdate: 20280101 } }),
      2027,
    )
    expect(other).toEqual({ status: 'OK', holidays: [] })
  })

  it('0건이면 빈 목록 (아직 발표 전)', () => {
    expect(parseHolidayResponse(ok(''), 2030)).toEqual({ status: 'OK', holidays: [] })
  })

  it('결과 코드가 00이 아니면 사용 불가', () => {
    const text = JSON.stringify({
      response: { header: { resultCode: '30', resultMsg: 'KEY ERROR' } },
    })
    const result = parseHolidayResponse(text, 2027)
    expect(result.status).toBe('UNAVAILABLE')
  })

  it('인증 오류 XML이면 사유를 꺼내 사용 불가', () => {
    const xml =
      '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>' +
      '<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>'
    const result = parseHolidayResponse(xml, 2027)
    expect(result).toEqual({
      status: 'UNAVAILABLE',
      reason: '공휴일 API 오류: SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
    })
  })
})
