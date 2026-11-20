import type { StatusFormat } from '@/components/data-grid'
import { codeSet } from '@/config/operator-codes'

// 거래처·납품처 값 목록 (docs/decisions/0082) — 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건
// DB 검사 조건(마이그레이션 _customer_ship_to)과 값 목록이 같아야 한다. 거래처 유형만 공통코드(CUSTOMER_TYPE)

export const CUSTOMER_TYPE_GROUP = 'CUSTOMER_TYPE'

// 거래처 역할 (0090): 매출처(납품받는 곳) / 매입처(공급처 — 입고 출발지, 납품처 없음) / 둘 다
export const CUSTOMER_ROLE = codeSet({
  SALES: '매출처',
  PURCHASE: '매입처(공급처)',
  BOTH: '매출·매입',
})
// ASN 공급처로 고를 수 있는 역할
export const SUPPLIER_ROLES: readonly string[] = ['PURCHASE', 'BOTH']

// 거래처 상태: 거래중지는 신규 출고요청만 막는다 (진행 중 주문은 처리, 출고 작업에서 적용)
export const CUSTOMER_STATUS = codeSet({ ACTIVE: '거래중', SUSPENDED: '거래중지' })
export const CUSTOMER_STATUS_BADGE: StatusFormat = {
  ACTIVE: { label: '거래중', tone: 'success' },
  SUSPENDED: { label: '거래중지', tone: 'warning' },
}

// 주문 주소 사용 방식: 납품처 지정(기본) / 주문의 수령인 주소(온라인몰·B2C — 주문 작업에서 사용)
export const ORDER_ADDR_MODE = codeSet({
  SHIP_TO: '납품처 지정',
  ORDER_ADDR: '주문 수령인 주소',
})

// 등록 경로 (다른 기준정보와 공유할 값)
export const DATA_SOURCE = codeSet({
  SCREEN: '운영사 화면',
  PORTAL: '화주 포털',
  API: 'API',
  UPLOAD: '엑셀 업로드',
  ORDER_AUTO: '주문 시 자동',
})

export const SHIP_TO_STATUS = codeSet({ ACTIVE: '사용', INACTIVE: '사용 중지' })

// 배송센터 지정 구분: 연동으로 받음 / 권역 자동 / 화면 수동 — 권역설정이 바뀌면 AUTO만 따라 바뀐다
export const CENTER_ASSIGN_TYPE = codeSet({ IF: '연동', AUTO: '권역 자동', MANUAL: '수동' })
export const CENTER_ASSIGN_STATUS = codeSet({ ASSIGNED: '지정 완료', NEED_CONFIRM: '확인 필요' })
export const CENTER_ASSIGN_STATUS_BADGE: StatusFormat = {
  ASSIGNED: { label: '지정 완료', tone: 'success' },
  NEED_CONFIRM: { label: '확인 필요', tone: 'warning' },
}

// 확인 필요 사유 (정의서 4번 표)
export const CENTER_CONFIRM_REASON = codeSet({
  ADDR_NOT_RESOLVED: '주소 정제 실패·자동 허용 등급 미만',
  REGION_UNASSIGNED: '권역설정에 배정되지 않은 지역',
  REGION_MIXED: '여러 센터가 섞인 지역',
  NOT_SHIPPER_CENTER: '화주 이용 센터가 아님',
  CENTER_INACTIVE: '센터가 일시중지·폐쇄',
  INVALID_CENTER_CD: '없는 센터코드',
})
export type CenterConfirmReason = (typeof CENTER_CONFIRM_REASON.values)[number]

// 주소 정제 등급 글자색 (A·B 정상, C·D 주의, F 실패)
export const ADDR_GRADE_TONE: Record<string, string> = {
  A: 'text-success',
  B: 'text-success',
  C: 'text-warning',
  D: 'text-warning',
  F: 'text-destructive',
}
