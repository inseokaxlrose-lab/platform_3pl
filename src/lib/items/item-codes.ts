import type { StatusFormat } from '@/components/data-grid'
import { codeSet } from '@/config/operator-codes'

// 품목 값 목록 (docs/decisions/0083) — 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건
// DB 검사 조건(마이그레이션 _item_spec)과 값 목록이 같아야 한다

// 품목 유형: SET이면 세트 품목 (구성품은 2차)
export const ITEM_TYPE = codeSet({
  GOODS: '상품',
  PRODUCT: '제품',
  SEMI: '반제품',
  RAW: '원자재',
  SUB: '부자재',
  SET: '세트',
  SUPPLY: '판촉물·소모품',
  ETC: '기타',
})

// 품목 상태: 단종 = 신규 입고 불가, 재고 출고는 가능 / 사용중지 = 신규 입고·출고요청 모두 불가
export const ITEM_STATUS = codeSet({ ACTIVE: '사용', INACTIVE: '사용중지', DISCONTINUED: '단종' })
export const ITEM_STATUS_BADGE: StatusFormat = {
  ACTIVE: { label: '사용', tone: 'success' },
  INACTIVE: { label: '사용중지', tone: 'neutral' },
  DISCONTINUED: { label: '단종', tone: 'warning' },
}

// 품목 단위 레벨 (품목마다 레벨별 1행, 정렬도 이 순서)
export const UNIT_LEVEL = codeSet({ BASE: '기본', INNER: '내포장', BOX: '박스', PLT: '팔레트' })
export type UnitLevel = (typeof UNIT_LEVEL.values)[number]
export const UNIT_LEVEL_ORDER: Record<UnitLevel, number> = { BASE: 0, INNER: 1, BOX: 2, PLT: 3 }

// 기한 종류 (표시·출력 라벨)
export const EXPIRY_TYPE = codeSet({
  CONSUME: '소비기한',
  SELL: '유통기한',
  USE: '사용기한',
  VALID: '유효기간',
})

// 기한 입력 방식: 기한일 / 제조일(+총 기한 일수로 계산) / 둘 다
export const EXPIRY_INPUT = codeSet({
  EXPIRY: '기한일 입력',
  MFG: '제조일 입력',
  BOTH: '둘 다 입력',
})

// LOT 생성 방식
export const LOT_SOURCE = codeSet({
  INPUT: '입고 시 입력',
  MFG_DATE: '제조일을 LOT로',
  EXPIRY_DATE: '기한일을 LOT로',
  SYSTEM: '시스템 자동 채번',
})

// 바코드 종류 (EAN13·EAN8·UPCA·ITF14는 체크디지트 검사)
export const BARCODE_TYPE = codeSet({
  EAN13: 'EAN-13',
  EAN8: 'EAN-8',
  UPCA: 'UPC-A',
  ITF14: 'ITF-14',
  GS1_128: 'GS1-128',
  CODE128: 'CODE 128',
  QR: 'QR',
  CUSTOM: '화주 자체',
})
export type BarcodeType = (typeof BARCODE_TYPE.values)[number]
