// 운영사 기본 단위 (docs/decisions/0034, 0039) — 운영사를 만들 때 그 운영사에 복사한다
// 운영에서도 항상 만든다 (견본 데이터 아님). "없으면 만들기"만 해서 화면에서 고친 이름·순서는 그대로
// isSystem: 프로그램이 직접 쓰는 단위 (EA = 기본, BOX·PLT = 라벨 단위) — 삭제·사용 중지 불가

type DefaultUnit = {
  code: string
  name: string
  kind: 'BASE' | 'PACK'
  decimals: number
  isSystem?: boolean
}

export const DEFAULT_UNITS: readonly DefaultUnit[] = [
  { code: 'EA', name: '개', kind: 'BASE', decimals: 0, isSystem: true },
  { code: 'SET', name: '세트', kind: 'BASE', decimals: 0 },
  { code: 'KG', name: '킬로그램', kind: 'BASE', decimals: 3 },
  { code: 'G', name: '그램', kind: 'BASE', decimals: 0 },
  { code: 'L', name: '리터', kind: 'BASE', decimals: 3 },
  { code: 'ML', name: '밀리리터', kind: 'BASE', decimals: 0 },
  { code: 'M', name: '미터', kind: 'BASE', decimals: 2 },
  { code: 'BOX', name: '박스', kind: 'PACK', decimals: 0, isSystem: true },
  { code: 'CARTON', name: '카톤', kind: 'PACK', decimals: 0 },
  { code: 'PLT', name: '팔레트', kind: 'PACK', decimals: 0, isSystem: true },
  { code: 'PACK', name: '팩', kind: 'PACK', decimals: 0 },
]
