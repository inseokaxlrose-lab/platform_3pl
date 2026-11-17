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
      { code: 'INBOUND', name: '입고' },
      { code: 'OUTBOUND', name: '출고' },
      { code: 'INVENTORY', name: '재고' },
      { code: 'SETTLEMENT', name: '정산' },
      { code: 'CONTRACT', name: '계약' },
      { code: 'IT', name: 'IT' },
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
]
