import type { FaultParty } from '@/config/db-codes'

// 운영사 기본 공통코드 (docs/decisions/0030, 0039)
// 운영사를 만들 때(플랫폼 등록·시드) 그 운영사에 복사한다 (src/lib/operator/provision.ts)
// 시스템 그룹: 프로그램이 쓰는 그룹이라 운영에서도 항상 만든다 (견본 데이터 아님)
// "없으면 만들기"만 한다 → 관리 화면에서 고친 이름·순서·사용 여부를 되돌리지 않는다

type DefaultCodeGroup = {
  code: string
  name: string
  description: string
  // 사유 코드 그룹: 코드마다 귀책(FAULT_PARTY)을 둔다 (0087)
  faultParty?: boolean
  items: readonly { code: string; name: string; faultParty?: FaultParty }[]
}

export const DEFAULT_CODE_GROUPS: readonly DefaultCodeGroup[] = [
  {
    code: 'CONTACT_ROLE',
    name: '담당 업무',
    description: '운영사·화주사·거래처 담당자의 주요 업무',
    items: [
      { code: 'SALES', name: '영업' },
      { code: 'INBOUND', name: '입고' },
      { code: 'OUTBOUND', name: '출고' },
      { code: 'INVENTORY', name: '재고' },
      { code: 'SETTLEMENT', name: '정산' },
      { code: 'CONTRACT', name: '계약' },
      { code: 'IT', name: 'IT' },
      { code: 'CS', name: '고객응대' },
      { code: 'ETC', name: '기타' },
    ],
  },
  {
    code: 'CENTER_CONTACT_ROLE',
    name: '센터 담당 업무',
    description: '센터 담당자의 주요 업무',
    items: [
      { code: 'MANAGER', name: '센터장' },
      { code: 'INBOUND', name: '입고' },
      { code: 'OUTBOUND', name: '출고' },
      { code: 'INVENTORY', name: '재고' },
      { code: 'RETURN', name: '반품' },
      { code: 'SAFETY', name: '안전관리' },
      { code: 'IT', name: 'IT' },
      { code: 'ETC', name: '기타' },
    ],
  },
  {
    code: 'SERVICE_TYPE',
    name: '제공 서비스',
    description: '운영사가 제공하는 물류 서비스',
    items: [
      { code: 'STORAGE', name: '보관' },
      { code: 'INOUT', name: '입출고' },
      { code: 'PARCEL', name: '택배' },
      { code: 'RETURN', name: '반품' },
      { code: 'VAS', name: '유통가공' },
      { code: 'KITTING', name: '키팅' },
      { code: 'TRANSPORT', name: '운송' },
    ],
  },
  {
    code: 'STORAGE_METHOD',
    name: '보관 방식',
    description: '창고의 주된 보관 방식',
    items: [
      { code: 'RACK', name: '랙' },
      { code: 'FLOOR', name: '평치' },
      { code: 'SHELF', name: '선반' },
      { code: 'MEZZANINE', name: '복층' },
      { code: 'AUTO', name: '자동화 설비' },
    ],
  },
  // 구역·로케이션 (0075)
  {
    code: 'ZONE_TYPE',
    name: '구역 유형',
    description: '창고 안 구역의 운영 방식',
    items: [
      { code: 'STORAGE', name: '보관' },
      { code: 'PICKING', name: '피킹' },
      { code: 'RESERVE', name: '벌크·예비' },
      { code: 'STAGING', name: '작업대기' },
      { code: 'VAS', name: '유통가공' },
      { code: 'ETC', name: '기타' },
    ],
  },
  {
    code: 'LOC_TYPE',
    name: '로케이션 유형',
    description: '로케이션(보관 칸)의 형태',
    items: [
      { code: 'RACK', name: '랙' },
      { code: 'FLOOR', name: '평치' },
      { code: 'SHELF', name: '선반' },
      { code: 'BIN', name: '빈·소형칸' },
      { code: 'DOCK', name: '도크' },
      { code: 'STAGING', name: '작업대기' },
      { code: 'VIRTUAL', name: '가상' },
    ],
  },
  {
    code: 'LOCK_REASON',
    name: '로케이션 잠금 사유',
    description: '로케이션을 잠근 이유',
    items: [
      { code: 'COUNT', name: '재고 실사' },
      { code: 'DAMAGE', name: '설비 파손' },
      { code: 'INSPECTION', name: '점검' },
      { code: 'ETC', name: '기타' },
    ],
  },
  {
    code: 'ABC_CLASS',
    name: '회전 등급',
    description: '로케이션 회전 등급 (적치 추천용)',
    items: [
      { code: 'A', name: 'A' },
      { code: 'B', name: 'B' },
      { code: 'C', name: 'C' },
    ],
  },
  // 화주사 (0080)
  {
    code: 'SHIPPER_TYPE',
    name: '화주 유형',
    description: '화주사의 사업 형태',
    items: [
      { code: 'MANUFACTURER', name: '제조' },
      { code: 'DISTRIBUTOR', name: '유통·도매' },
      { code: 'ECOMMERCE', name: '이커머스' },
      { code: 'IMPORTER', name: '수입' },
      { code: 'BRAND', name: '브랜드' },
      { code: 'ETC', name: '기타' },
    ],
  },
  {
    code: 'SHIPPER_INDUSTRY',
    name: '화주 업종',
    description: '화주사가 다루는 상품 분야',
    items: [
      { code: 'FOOD', name: '식품' },
      { code: 'BEVERAGE', name: '음료' },
      { code: 'APPAREL', name: '의류·잡화' },
      { code: 'COSMETIC', name: '화장품' },
      { code: 'PHARMA', name: '의약·건기식' },
      { code: 'ELECTRONICS', name: '전자' },
      { code: 'LIVING', name: '생활용품' },
      { code: 'ETC', name: '기타' },
    ],
  },
  {
    code: 'SETTLE_CYCLE',
    name: '정산 주기',
    description: '화주사 정산 주기',
    items: [
      { code: 'MONTHLY', name: '월' },
      { code: 'SEMI_MONTHLY', name: '반월' },
      { code: 'WEEKLY', name: '주' },
    ],
  },
  // 거래처 (0082)
  {
    code: 'CUSTOMER_TYPE',
    name: '거래처 유형',
    description: '거래처(화주가 물건을 파는 상대)의 형태',
    items: [
      { code: 'STORE', name: '매장' },
      { code: 'AGENCY', name: '대리점' },
      { code: 'WHOLESALE', name: '도매' },
      { code: 'RETAIL_CHAIN', name: '유통사·체인 본사' },
      { code: 'ONLINE_MALL', name: '온라인몰' },
      { code: 'CORPORATE', name: '기업·기관' },
      { code: 'INTERNAL', name: '자사·계열사' },
      { code: 'ETC', name: '기타' },
    ],
  },
  // ── 사유 코드 (0087): 귀책별로 집계한다. 기존 운영사에는 마이그레이션 20261120080000_reason_codes가 넣었다
  {
    code: 'DEFECT_REASON',
    name: '검수 불량 사유',
    description: '입고 검수에서 불량으로 잡은 이유 (귀책별 집계)',
    faultParty: true,
    items: [
      { code: 'OUTER_DAMAGE', name: '외박스 파손', faultParty: 'CARRIER' },
      { code: 'PRODUCT_DAMAGE', name: '제품 파손', faultParty: 'SHIPPER' },
      { code: 'CONTAMINATION', name: '오염·변질', faultParty: 'SHIPPER' },
      { code: 'WRONG_ITEM', name: '오품·혼입', faultParty: 'SHIPPER' },
      { code: 'EXPIRY_SHORT', name: '유통기한 부족', faultParty: 'SHIPPER' },
      { code: 'LABEL_ERROR', name: '표시·라벨 불량', faultParty: 'SHIPPER' },
      { code: 'ETC', name: '기타', faultParty: 'ETC' },
    ],
  },
  {
    code: 'ADJUST_REASON',
    name: '재고 조정 사유',
    description: '재고 실사·조정을 한 이유 (귀책별 집계)',
    faultParty: true,
    items: [
      { code: 'COUNT_DIFF', name: '실사 차이', faultParty: 'CENTER' },
      { code: 'STORAGE_DAMAGE', name: '보관 중 파손', faultParty: 'CENTER' },
      { code: 'LOSS', name: '분실', faultParty: 'CENTER' },
      { code: 'EXPIRED_DISPOSAL', name: '기한 경과 폐기', faultParty: 'SHIPPER' },
      { code: 'SHIPPER_REQUEST', name: '화주 요청', faultParty: 'SHIPPER' },
      { code: 'INPUT_ERROR', name: '입력 오류 정정', faultParty: 'CENTER' },
      { code: 'ETC', name: '기타', faultParty: 'ETC' },
    ],
  },
  {
    code: 'HOLD_REASON',
    name: '재고 보류 사유',
    description: '재고를 보류·불량·격리로 바꾼 이유',
    faultParty: true,
    items: [
      { code: 'QUALITY_CHECK', name: '품질 검사', faultParty: 'SHIPPER' },
      { code: 'SHIPPER_REQUEST', name: '화주 요청', faultParty: 'SHIPPER' },
      { code: 'DAMAGE_SUSPECT', name: '파손 의심', faultParty: 'CENTER' },
      { code: 'RECALL', name: '리콜', faultParty: 'SHIPPER' },
      { code: 'EXPIRY_NEAR', name: '기한 임박', faultParty: 'SHIPPER' },
      { code: 'ETC', name: '기타', faultParty: 'ETC' },
    ],
  },
  {
    code: 'ASN_CLOSE_REASON',
    name: '입고 잔량 마감 사유',
    description: 'ASN 남은 수량을 마감한 이유',
    faultParty: true,
    items: [
      { code: 'NOT_SHIPPED', name: '공급처 미발송', faultParty: 'SHIPPER' },
      { code: 'SHIPPER_CANCEL', name: '화주 취소', faultParty: 'SHIPPER' },
      { code: 'DEFECT_RETURN', name: '불량 반송', faultParty: 'SHIPPER' },
      { code: 'SHORT_DELIVERY', name: '운송 중 누락', faultParty: 'CARRIER' },
      { code: 'ETC', name: '기타', faultParty: 'ETC' },
    ],
  },
  {
    code: 'CANCEL_REASON',
    name: '출고 취소 사유',
    description: '출고 주문을 취소한 이유 (출고 기능에서 사용)',
    faultParty: true,
    items: [
      { code: 'CUSTOMER_REQUEST', name: '고객 요청', faultParty: 'SHIPPER' },
      { code: 'SHIPPER_REQUEST', name: '화주 요청', faultParty: 'SHIPPER' },
      { code: 'STOCK_SHORT', name: '재고 부족', faultParty: 'CENTER' },
      { code: 'ADDRESS_ERROR', name: '주소 오류', faultParty: 'SHIPPER' },
      { code: 'ETC', name: '기타', faultParty: 'ETC' },
    ],
  },
  {
    code: 'RETURN_REASON',
    name: '반품 사유',
    description: '반품을 받은 이유 (반품 기능에서 사용)',
    faultParty: true,
    items: [
      { code: 'CHANGE_MIND', name: '단순 변심', faultParty: 'ETC' },
      { code: 'PRODUCT_DEFECT', name: '제품 불량', faultParty: 'SHIPPER' },
      { code: 'WRONG_SHIP', name: '오배송', faultParty: 'CENTER' },
      { code: 'DELIVERY_DAMAGE', name: '배송 중 파손', faultParty: 'CARRIER' },
      { code: 'DELAY', name: '배송 지연', faultParty: 'CARRIER' },
      { code: 'ETC', name: '기타', faultParty: 'ETC' },
    ],
  },
]
