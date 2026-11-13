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
} as const

export type PermissionAction = keyof typeof PERMISSION_ACTION_LABELS

// 영역: admin = 운영사 화면(/admin), portal = 화주 포털(/portal)
export type PermissionArea = 'admin' | 'portal'

type PermissionMenuDefinition = {
  label: string
  group: string
  area: PermissionArea
  actions: readonly PermissionAction[]
}

const CRUD = ['read', 'create', 'update', 'delete'] as const

export const PERMISSION_MENUS = {
  // ── 운영사 화면 · 기준정보
  'master.company': {
    label: '운영사',
    group: '기준정보',
    area: 'admin',
    actions: ['read', 'update'],
  },
  'master.centers': { label: '센터', group: '기준정보', area: 'admin', actions: CRUD },
  'master.warehouses': { label: '창고', group: '기준정보', area: 'admin', actions: CRUD },
  'master.locations': { label: '로케이션', group: '기준정보', area: 'admin', actions: CRUD },
  'master.delivery-zones': { label: '배송권역', group: '기준정보', area: 'admin', actions: CRUD },
  'master.units': { label: '단위', group: '기준정보', area: 'admin', actions: CRUD },
  'master.shippers': { label: '화주사', group: '기준정보', area: 'admin', actions: CRUD },
  'master.items': {
    label: '품목',
    group: '기준정보',
    area: 'admin',
    actions: [...CRUD, 'export'],
  },
  'master.customers': { label: '거래처', group: '기준정보', area: 'admin', actions: CRUD },

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
  'stock.inventory': {
    label: '재고 조회',
    group: '재고',
    area: 'admin',
    actions: ['read', 'export'],
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

  // ── 운영사 화면 · 시스템
  'system.users': { label: '사용자', group: '시스템', area: 'admin', actions: CRUD },
  'system.roles': { label: '권한그룹', group: '시스템', area: 'admin', actions: CRUD },
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
