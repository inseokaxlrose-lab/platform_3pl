import type { StatusFormat } from '@/components/data-grid'
import { codeSet } from '@/config/operator-codes'

// 화주사 상태·정책 값 (docs/decisions/0080) — 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건
// (공통코드가 아니다: 운영사마다 바꿀 수 있으면 안 된다, 0030·0040)
// DB 검사 조건(마이그레이션 _shipper_spec)과 값 목록이 같아야 한다 — 값을 더하면 마이그레이션도 함께

export const SHIPPER_STATUS = codeSet({
  PREPARING: '준비중',
  ACTIVE: '운영중',
  SUSPENDED: '일시정지',
  TERMINATED: '해지',
})

// 목록·헤더 배지 (색: 준비중 파랑, 운영중 초록, 일시정지 노랑, 해지 빨강)
export const SHIPPER_STATUS_BADGE: StatusFormat = {
  PREPARING: { label: '준비중', tone: 'info' },
  ACTIVE: { label: '운영중', tone: 'success' },
  SUSPENDED: { label: '일시정지', tone: 'warning' },
  TERMINATED: { label: '해지', tone: 'danger' },
}

// 일시정지·해지는 사유 필수 (DB 검사 조건 tb_shipper_status_reason_check)
export const SHIPPER_STATUSES_NEEDING_REASON: readonly string[] = ['SUSPENDED', 'TERMINATED']

// 상태별로 화주사를 어디에 쓸 수 있나 (정의서 "상태별 동작")
// - 새 입고(ASN)·주문: 운영중만 → 조회 조건은 ACTIVE_ONLY ({ status: 'ACTIVE' })
// - 기준정보 준비(품목·거래처 등록, 포털 사용자 연결): 준비중 + 운영중
// - 데이터 범위(소속 사용자 로그인·조회): 해지만 뺀다 (일시정지는 조회만 — 새 업무가 막혀 저절로 조회 전용)
export const SHIPPER_SETUP_STATUSES = ['PREPARING', 'ACTIVE'] as const
export const SHIPPER_SETUP_ONLY = { status: { in: [...SHIPPER_SETUP_STATUSES] } }
export const isShipperSetupStatus = (status: string) =>
  (SHIPPER_SETUP_STATUSES as readonly string[]).includes(status)
export const isShipperInScopeStatus = (status: string) => status !== 'TERMINATED'

// 재고 부족 시 처리 (출고 작업에서 사용)
export const SHORTAGE_POLICY = codeSet({
  HOLD: '전체 보류',
  PARTIAL: '가능분 출고',
  CANCEL_SHORT: '부족분 취소',
})

// 납품처 배송센터 미지정 처리 (납품처·주문 작업에서 사용)
export const SHIP_TO_CENTER_POLICY = codeSet({
  AUTO_HOLD: '자동 지정, 실패 시 보류',
  AUTO_REJECT: '자동 지정, 실패 시 반려',
  REQUIRED: '배송센터 필수 (없으면 반려)',
})

// 주문번호 중복 기준 (주문 작업에서 사용)
export const ORDER_NO_SCOPE = codeSet({
  SHIPPER: '화주 전체 기간 유일',
  SHIPPER_DAY: '일자별 유일',
})

// 연동 방식 (파일·EDI는 2차)
export const IF_METHOD = codeSet({
  PORTAL: '포털',
  API: 'API',
  FILE: '파일(SFTP)',
  EDI: 'EDI',
})

// 이용 센터 상태
export const SHIPPER_CENTER_STATUS = codeSet({ ACTIVE: '이용중', INACTIVE: '이용종료' })
