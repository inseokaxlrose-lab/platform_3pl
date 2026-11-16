import type { StatusFormat } from '@/components/data-grid'
import { codeSet } from '@/config/operator-codes'

// 센터 유형·운영 상태 (docs/decisions/0073) — 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건
// (공통코드가 아니다: 운영사마다 바꿀 수 있으면 안 된다, 0030·0040)

export const CENTER_TYPE = codeSet({
  OWN: '자가',
  LEASE: '임차',
  PARTNER: '협력·위탁',
  VIRTUAL: '가상',
})

export const CENTER_STATUS = codeSet({
  PREPARING: '준비중',
  ACTIVE: '운영중',
  SUSPENDED: '일시중지',
  CLOSED: '폐쇄',
})

// 목록·헤더 배지 (색: 준비중 파랑, 운영중 초록, 일시중지 노랑, 폐쇄 빨강)
export const CENTER_STATUS_BADGE: StatusFormat = {
  PREPARING: { label: '준비중', tone: 'info' },
  ACTIVE: { label: '운영중', tone: 'success' },
  SUSPENDED: { label: '일시중지', tone: 'warning' },
  CLOSED: { label: '폐쇄', tone: 'danger' },
}

// 일시중지·폐쇄로 바꿀 때는 사유가 필수 (DB 검사 조건 tb_center_status_reason_check), 폐쇄는 운영 종료일도
export const CENTER_STATUSES_NEEDING_REASON: readonly string[] = ['SUSPENDED', 'CLOSED']

// 상태별로 센터를 어디에 쓸 수 있나
// - 새 업무(입고·재고·출고·배송 센터): 운영중만 → 조회 조건은 ACTIVE_ONLY ({ status: 'ACTIVE' })
// - 기준정보 준비(창고·배송권역 추가, 화주사 이용 센터, 사용자 소속): 준비중 + 운영중
// - 데이터 범위(소속 직원이 그 센터 데이터를 보는지): 폐쇄만 뺀다
export const CENTER_SETUP_STATUSES = ['PREPARING', 'ACTIVE'] as const
export const CENTER_SETUP_ONLY = { status: { in: [...CENTER_SETUP_STATUSES] } }
export const isCenterSetupStatus = (status: string) =>
  (CENTER_SETUP_STATUSES as readonly string[]).includes(status)
export const isCenterInScopeStatus = (status: string) => status !== 'CLOSED'
