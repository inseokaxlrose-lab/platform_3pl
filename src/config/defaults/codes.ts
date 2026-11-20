// 운영사 기본 공통코드 (docs/decisions/0030, 0039)
// 운영사를 만들 때(플랫폼 등록·시드) 그 운영사에 복사한다 (src/lib/operator/provision.ts)
// 시스템 그룹: 프로그램이 쓰는 그룹이라 운영에서도 항상 만든다 (견본 데이터 아님)
// "없으면 만들기"만 한다 → 관리 화면에서 고친 이름·순서·사용 여부를 되돌리지 않는다

type DefaultCodeGroup = {
  code: string
  name: string
  description: string
  items: readonly { code: string; name: string }[]
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
]
