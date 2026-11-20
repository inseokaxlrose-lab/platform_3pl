// 외부코드 매핑 메뉴의 대상 종류 (화면·서버 공용, docs/decisions/0068)
// 값은 DB의 entity_type_cd(ExternalEntityType)와 같은 글자. 로케이션은 아직 연동 대상이 아니라 뺀다

export const EXTERNAL_TARGETS = [
  'CENTER',
  'WAREHOUSE',
  'SHIPPER',
  'ITEM',
  'CUSTOMER',
  'UNIT',
  'CARRIER',
  'ROUTE',
] as const

export type ExternalTarget = (typeof EXTERNAL_TARGETS)[number]

export const EXTERNAL_TARGET_LABELS: Record<ExternalTarget, string> = {
  CENTER: '센터',
  WAREHOUSE: '창고',
  SHIPPER: '화주사',
  ITEM: '품목',
  CUSTOMER: '거래처',
  UNIT: '단위',
  CARRIER: '운송사',
  ROUTE: '배송 코스',
}

// 대상마다 "소속" 칸에 보여 줄 것 (없으면 칸을 숨긴다)
export const EXTERNAL_TARGET_OWNER: Partial<Record<ExternalTarget, string>> = {
  WAREHOUSE: '센터',
  ITEM: '화주사',
  CUSTOMER: '화주사',
  ROUTE: '센터',
}

// 검색 조건 글자 → 대상 (빈 값·모르는 값은 첫 대상 = 센터)
export function parseExternalTarget(value: string | undefined): ExternalTarget {
  return (EXTERNAL_TARGETS as readonly string[]).includes(value ?? '')
    ? (value as ExternalTarget)
    : 'CENTER'
}
