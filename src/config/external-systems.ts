// 외부 코드 연동 상대 목록 (docs/decisions/0025)
// 처음에는 설정 파일로 둔다. 화주사 ERP 연동이 생기면 화주사별 연동 상대(예: GANA-ERP)를 추가하고,
// 그때 관리 화면을 검토한다. 키는 DB에 그대로 저장되므로 한 번 쓰기 시작하면 바꾸지 않는다
export const EXTERNAL_SYSTEMS = {
  SAP: { label: 'SAP' },
  ERP: { label: 'ERP' },
} as const

export type ExternalSystemKey = keyof typeof EXTERNAL_SYSTEMS

export const EXTERNAL_SYSTEM_KEYS = Object.keys(EXTERNAL_SYSTEMS) as ExternalSystemKey[]

export function isExternalSystemKey(value: string): value is ExternalSystemKey {
  return value in EXTERNAL_SYSTEMS
}
