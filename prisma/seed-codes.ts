// 시드가 만드는 공통코드 (docs/decisions/0030)
// 시스템 그룹: 프로그램이 쓰는 그룹이라 운영에서도 항상 만든다 (견본 데이터 아님)
// 시드는 "없으면 만들기"만 한다 → 관리 화면에서 고친 이름·순서·사용 여부를 되돌리지 않는다

type SeedCodeGroup = {
  code: string
  name: string
  description: string
  items: readonly { code: string; name: string }[]
}

export const SEED_CODE_GROUPS: readonly SeedCodeGroup[] = [
  {
    code: 'CONTACT_DUTY',
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
]
