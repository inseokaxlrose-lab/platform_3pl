import {
  ALL_PERMISSION_CODES,
  isPermissionCode,
  PERMISSION_MENUS,
  type PermissionArea,
  type PermissionCode,
  type PermissionMenu,
} from '@/config/permissions'

const ORDER = new Map(ALL_PERMISSION_CODES.map((code, index) => [code, index]))

function menuOf(code: PermissionCode) {
  return code.slice(0, code.lastIndexOf('.')) as PermissionMenu
}

// 권한그룹에 저장할 권한 코드 정리 (화면 체크 표·서버 저장 공용, 0013 규칙)
// - 목록에 없는 코드, 그룹 영역과 다른 영역의 코드는 뺀다 (dropped로 알림)
// - 버튼 권한이 있으면 그 메뉴의 조회(read)를 넣는다
// - 중복 제거, 권한 목록 순서로 정렬
export function normalizeGroupCodes(codes: readonly string[], area: PermissionArea) {
  const kept = new Set<PermissionCode>()
  const dropped: string[] = []

  for (const raw of codes) {
    if (!isPermissionCode(raw) || PERMISSION_MENUS[menuOf(raw)].area !== area) {
      if (!dropped.includes(raw)) dropped.push(raw)
      continue
    }
    kept.add(raw)
    kept.add(`${menuOf(raw)}.read` as PermissionCode)
  }

  return {
    codes: [...kept].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!),
    dropped,
  }
}

// DB의 AppArea(ADMIN/PORTAL) ↔ 권한 목록의 영역(admin/portal)
export function toPermissionArea(area: 'ADMIN' | 'PORTAL'): PermissionArea {
  return area === 'ADMIN' ? 'admin' : 'portal'
}
