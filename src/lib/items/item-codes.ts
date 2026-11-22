import type { StatusFormat } from '@/components/data-grid'
import { codeSet } from '@/config/operator-codes'

// 품목 값 목록 (docs/decisions/0083) — 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건
// DB 검사 조건(마이그레이션 _item_spec)과 값 목록이 같아야 한다

// 품목 유형: SET이면 세트 품목 (구성품·세트 방식은 0098)
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
export type ItemTypeKey = (typeof ITEM_TYPE.values)[number]

// 세트 방식 (0098, 세트 품목만): 가상 세트 = 세트 재고 없이 출고 때 구성품 재고에서 뺀다
// 실물 세트 = 미리 조립해 세트 품목 자체를 재고로 둔다 (조립 작업은 부가작업 C1 때 — 1차 출고는 가상 세트만)
export const SET_TYPE = codeSet({
  VIRTUAL: '가상 세트 (구성품 출고)',
  KIT: '실물 세트 (조립 보관)',
})
export type SetTypeKey = (typeof SET_TYPE.values)[number]
// 세트 하나에 넣을 수 있는 구성품 수
export const MAX_SET_COMPONENTS = 50

// 품목 상태: 단종 = 신규 입고 불가, 재고 출고는 가능 / 사용중지 = 신규 입고·출고요청 모두 불가
export const ITEM_STATUS = codeSet({ ACTIVE: '사용', INACTIVE: '사용중지', DISCONTINUED: '단종' })
export type ItemStatus = (typeof ITEM_STATUS.values)[number]
export const ITEM_STATUS_BADGE: StatusFormat = {
  ACTIVE: { label: '사용', tone: 'success' },
  INACTIVE: { label: '사용중지', tone: 'neutral' },
  DISCONTINUED: { label: '단종', tone: 'warning' },
}

// 등록 경로 (누가 만들었나 — 목록 거르기·연동 정보 표시)
export const ITEM_SOURCE = codeSet({
  SCREEN: '운영사 화면',
  PORTAL: '화주 포털',
  API: 'API 연동',
  UPLOAD: '엑셀 업로드',
  ORDER_AUTO: '주문 자동',
})
export type ItemSourceKey = (typeof ITEM_SOURCE.values)[number]

// 체적 상태 (BOX 규격 기준 — 목록 배지)
export const VOLUME_STATUS_BADGE: StatusFormat = {
  OK: { label: '등록', tone: 'success' },
  MISSING: { label: '미등록', tone: 'warning' },
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
export type ExpiryTypeKey = (typeof EXPIRY_TYPE.values)[number]

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
