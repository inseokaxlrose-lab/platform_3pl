import {
  isPermissionCode,
  PERMISSION_MENUS,
  type PermissionArea,
  type PermissionCode,
  type PermissionMenu,
} from '@/config/permissions'
import { areaOf, type UserTypeValue } from '@/lib/redirect'

export type PermissionInput = {
  userType: UserTypeValue
  isActive: boolean
  // 속한 권한그룹들의 권한 코드 (DB 값 그대로, 중복 가능)
  groupCodes: readonly string[]
  // 사용자별 추가(GRANT) / 제외(DENY)
  grants: readonly string[]
  denies: readonly string[]
}

export type IgnoredReason = 'unknown' | 'other-area' | 'operator-only'

export type PermissionResult = {
  codes: ReadonlySet<PermissionCode>
  // 계산에서 뺀 코드와 이유 (관리 화면에서 정리할 수 있게 알려준다)
  ignored: { code: string; reason: IgnoredReason }[]
}

// 'inbound.asn.close' → 'inbound.asn'
function menuOf(code: PermissionCode) {
  return code.slice(0, code.lastIndexOf('.')) as PermissionMenu
}

// 운영사 사용자만 가질 수 있는 권한: 시스템 메뉴 (센터 직원이 자기에게 높은 권한을 주는 것을 막는다)
export function isOperatorOnly(code: PermissionCode) {
  return code.startsWith('system.')
}

// 최종 권한 계산 (0003 결정 7, docs/decisions/0013-permission-computation.md)
// 최종 권한 = 그룹 권한 합 + 사용자 추가 − 사용자 제외, 그리고:
// - 목록에 없는 옛 코드, 다른 영역(운영사 화면/포털)의 코드는 무시한다
// - 메뉴 조회(read) 권한이 없으면 그 메뉴의 다른 버튼 권한도 무효
// - 사용 중지 계정은 권한 없음
// - 시스템 메뉴(system.*: 사용자·권한그룹 등)는 운영사 사용자만 (권한 상승 방지, 0018)
export function computePermissions(input: PermissionInput): PermissionResult {
  const ignored: PermissionResult['ignored'] = []
  if (!input.isActive) return { codes: new Set(), ignored }

  const area: PermissionArea = areaOf(input.userType)
  const seenIgnored = new Set<string>()

  // 목록에 있고 자기 영역인 코드만 통과
  const accept = (raw: string): PermissionCode | null => {
    if (!isPermissionCode(raw)) {
      if (!seenIgnored.has(raw)) ignored.push({ code: raw, reason: 'unknown' })
      seenIgnored.add(raw)
      return null
    }
    if (PERMISSION_MENUS[menuOf(raw)].area !== area) {
      if (!seenIgnored.has(raw)) ignored.push({ code: raw, reason: 'other-area' })
      seenIgnored.add(raw)
      return null
    }
    if (isOperatorOnly(raw) && input.userType !== 'OPERATOR') {
      if (!seenIgnored.has(raw)) ignored.push({ code: raw, reason: 'operator-only' })
      seenIgnored.add(raw)
      return null
    }
    return raw
  }

  const codes = new Set<PermissionCode>()
  // 1) 그룹 권한 합 + 2) 사용자 추가
  for (const raw of [...input.groupCodes, ...input.grants]) {
    const code = accept(raw)
    if (code) codes.add(code)
  }
  // 3) 사용자 제외 (그룹에 있어도 제외가 이긴다)
  for (const raw of input.denies) {
    const code = accept(raw)
    if (code) codes.delete(code)
  }
  // 4) 메뉴 조회 권한이 없는 메뉴의 버튼 권한 제거
  for (const code of [...codes]) {
    const readCode = `${menuOf(code)}.read` as PermissionCode
    if (!codes.has(readCode)) codes.delete(code)
  }

  return { codes, ignored }
}
