import { codeSet } from '@/config/operator-codes'

// 휴무관리 값 목록 (docs/decisions/0096)
// 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건 (db-value-sets.db.test.ts가 같은지 확인)

// 운영사 개별 휴일 구분: 휴무(쉬는 날) / 특근(국가 공휴일·운영 요일이 쉬는 날이어도 일하는 날)
export const HOLIDAY_DAY_TYPE = codeSet({ CLOSED: '휴무', OPEN: '특근' })
export type HolidayDayType = (typeof HOLIDAY_DAY_TYPE.values)[number]

// 국가 공휴일 연도별 가져오기 결과: 가져옴 / 아직 발표 전(0건) / 실패(키 없음·연결 오류)
export const HOLIDAY_SYNC_STATUS = codeSet({ OK: '가져옴', EMPTY: '발표 전', FAILED: '실패' })
export type HolidaySyncStatus = (typeof HOLIDAY_SYNC_STATUS.values)[number]
