// 메뉴·버튼 권한 코드 목록 — 권한 코드의 유일한 출처
// 코드 형식: {메뉴}.{동작}  예) inbound.asn.create = ASN [등록] 버튼
// - read(조회) = 메뉴 접근 권한. 없으면 메뉴 자체가 보이지 않는다
// - DB(권한그룹·사용자 예외)에는 이 코드 글자만 저장한다 (docs/decisions/0010, 0011)

// 동작과 한글 이름표 (권한그룹 관리 화면 등에 표시)
export const PERMISSION_ACTION_LABELS = {
  read: '조회',
  create: '등록',
  update: '수정',
  delete: '삭제',
  confirm: '확정',
  close: '잔량 마감',
  print: '출력',
  export: '엑셀',
  switch: '운영사로 작업',
} as const

export type PermissionAction = keyof typeof PERMISSION_ACTION_LABELS

// 영역: admin = 운영사 화면(/admin), portal = 화주 포털(/portal), platform = 플랫폼 화면(/platform)
export type PermissionArea = 'admin' | 'portal' | 'platform'

type PermissionMenuDefinition = {
  label: string
  group: string
  area: PermissionArea
  actions: readonly PermissionAction[]
}

const CRUD = ['read', 'create', 'update', 'delete'] as const

export const PERMISSION_MENUS = {
  // ── 운영사 화면 · 기준정보
  'master.operator': {
    label: '운영사',
    group: '기준정보',
    area: 'admin',
    actions: ['read', 'update'],
  },
  'master.centers': {
    label: '센터',
    group: '기준정보',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  'master.warehouses': {
    label: '창고',
    group: '기준정보',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  'master.locations': {
    label: '로케이션',
    group: '기준정보',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  // 권역설정 (0076): 우편번호별 배송센터 배정. 지정·해제·추천 확인·엑셀 업로드 = 수정
  'master.regions': {
    label: '권역설정',
    group: '기준정보',
    area: 'admin',
    actions: ['read', 'update', 'export'],
  },
  'master.units': { label: '단위', group: '기준정보', area: 'admin', actions: CRUD },
  // 운송사·운송 계약 (0094): 택배사 등 + 센터(·화주)별 계약(고객코드·송장 대역)
  'master.carriers': { label: '운송사', group: '기준정보', area: 'admin', actions: CRUD },
  'master.carrier-contracts': {
    label: '운송 계약',
    group: '기준정보',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  // 배송 코스 (0095): 센터별 코스 + 우편번호 배정 (배정·해제 = 수정)
  'master.routes': {
    label: '배송 코스',
    group: '기준정보',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  'master.shippers': {
    label: '화주사',
    group: '기준정보',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  'master.items': {
    label: '품목',
    group: '기준정보',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  'master.customers': {
    label: '거래처',
    group: '기준정보',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  // 외부코드 매핑 (0068): 대상은 각 기준정보 화면에서 만들고, 여기서는 SAP·ERP 코드만 고친다
  'master.external-codes': {
    label: '외부코드 매핑',
    group: '기준정보',
    area: 'admin',
    actions: ['read', 'update', 'export'],
  },

  // ── 운영사 화면 · 입고
  'inbound.asn': {
    label: 'ASN',
    group: '입고',
    area: 'admin',
    actions: [...CRUD, 'close', 'export'],
  },
  'inbound.inspection': {
    label: '입고 검수',
    group: '입고',
    area: 'admin',
    actions: ['read', 'update'],
  },
  'inbound.labels': {
    label: '라벨 인쇄',
    group: '입고',
    area: 'admin',
    actions: ['read', 'print'],
  },
  'inbound.confirm': {
    label: '입고 확정',
    group: '입고',
    area: 'admin',
    actions: ['read', 'confirm'],
  },
  'inbound.putaway': { label: '적치', group: '입고', area: 'admin', actions: ['read', 'confirm'] },

  // ── 운영사 화면 · 재고
  // update: 재고상태 변경(정상·보류·불량·격리, 0088)
  'stock.inventory': {
    label: '재고 조회',
    group: '재고',
    area: 'admin',
    actions: ['read', 'update', 'export'],
  },
  // 실사·조정: 작업자가 등록(create)하고 관리자가 확정(confirm)하는 2단계
  'stock.adjustments': {
    label: '실사·조정',
    group: '재고',
    area: 'admin',
    actions: ['read', 'create', 'confirm'],
  },
  'stock.history': {
    label: '재고 이력',
    group: '재고',
    area: 'admin',
    actions: ['read', 'export'],
  },

  // ── 운영사 화면 · 연동 (화주 연동 API, 0081): 기본은 슈퍼 관리자(운영사 관리자)만
  // API 키: 조회 · 발급(등록) · 수정·폐기(수정). 키 관리는 화주사 편집 화면의 "연동" 섹션에서
  'integration.api-keys': {
    label: 'API 키',
    group: '연동',
    area: 'admin',
    actions: ['read', 'create', 'update'],
  },
  // API 호출 이력: 요청 로그·건별 결과 (본문은 개인정보를 가린 값)
  'integration.api-logs': {
    label: 'API 호출 이력',
    group: '연동',
    area: 'admin',
    actions: ['read', 'export'],
  },

  // ── 운영사 화면 · 시스템
  'system.users': {
    label: '사용자',
    group: '시스템',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  'system.roles': { label: '권한그룹', group: '시스템', area: 'admin', actions: CRUD },
  'system.codes': { label: '공통코드', group: '시스템', area: 'admin', actions: CRUD },
  // 체번 규칙 (0085): 대상별 코드·문서번호 모양을 운영사 규칙으로 바꾸기·기본으로 되돌리기
  // 운영 설정 (0092): 운영사가 바꾸는 키-값 설정
  'system.settings': {
    label: '운영 설정',
    group: '시스템',
    area: 'admin',
    actions: ['read', 'update'],
  },
  'system.numbering': {
    label: '체번 규칙',
    group: '시스템',
    area: 'admin',
    actions: ['read', 'update'],
  },
  // 휴무관리 (0096): 국가 공휴일 다시 가져오기는 update, 개별 휴일 등록·수정·삭제
  'system.holidays': {
    label: '휴무관리',
    group: '시스템',
    area: 'admin',
    actions: ['read', 'create', 'update', 'delete'],
  },
  'system.exports': {
    label: '자료 추출',
    group: '시스템',
    area: 'admin',
    actions: ['read', 'export'],
  },

  // ── 화주 포털 (운영사 화면 코드와 분리: 화주 담당자에게 운영사 권한이 섞이지 않게)
  'portal.items': { label: '품목', group: '포털', area: 'portal', actions: CRUD },
  'portal.asn': { label: 'ASN', group: '포털', area: 'portal', actions: CRUD },
  'portal.stock': { label: '내 재고', group: '포털', area: 'portal', actions: ['read', 'export'] },

  // ── 플랫폼 화면 (플랫폼 관리자는 이 영역의 권한을 모두 갖는다, 권한그룹 없음 — 0039)
  'platform.operators': {
    label: '운영사',
    group: '플랫폼',
    area: 'platform',
    actions: ['read', 'create', 'update', 'switch'],
  },
} as const satisfies Record<string, PermissionMenuDefinition>

export type PermissionMenu = keyof typeof PERMISSION_MENUS

// 허용된 권한 코드 타입: 위 목록에서 자동으로 만들어진다
// (예: 'inbound.asn.creat'처럼 틀리게 쓰면 타입 오류)
export type PermissionCode = {
  [M in PermissionMenu]: `${M}.${(typeof PERMISSION_MENUS)[M]['actions'][number]}`
}[PermissionMenu]

// 전체 권한 코드 목록 (정의 순서대로)
export const ALL_PERMISSION_CODES: readonly PermissionCode[] = (
  Object.entries(PERMISSION_MENUS) as [PermissionMenu, PermissionMenuDefinition][]
).flatMap(([menu, definition]) =>
  definition.actions.map((action) => `${menu}.${action}` as PermissionCode),
)

const CODE_SET: ReadonlySet<string> = new Set(ALL_PERMISSION_CODES)

// DB나 요청에서 받은 글자가 올바른 권한 코드인지 검사
export function isPermissionCode(value: string): value is PermissionCode {
  return CODE_SET.has(value)
}

// 메뉴 접근 권한 코드: 'inbound.asn' → 'inbound.asn.read'
export function menuReadPermission(menu: PermissionMenu) {
  return `${menu}.read` as PermissionCode
}
