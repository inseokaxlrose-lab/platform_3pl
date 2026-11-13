import {
  ALL_PERMISSION_CODES,
  isPermissionCode,
  PERMISSION_MENUS,
  type PermissionCode,
  type PermissionMenu,
} from '@/config/permissions'
import { areaOf, type UserTypeValue } from '@/lib/redirect'
import { isOperatorOnly } from './compute-permissions'

// 사용자별 추가·제외 권한 (0013 공식의 "+ 추가 − 제외" 부분, docs/decisions/0019)
// 체크 표의 한 칸 = 3단계: 그룹대로 → ＋추가 → −제외 → 그룹대로 …
// 모두 새 값을 돌려준다 (원래 값은 바꾸지 않음). 화면·서버 공용 순수 함수

export type OverrideState = 'inherit' | 'grant' | 'deny'

export type Overrides = {
  grants: readonly PermissionCode[]
  denies: readonly PermissionCode[]
}

export const EMPTY_OVERRIDES: Overrides = { grants: [], denies: [] }

// 칸을 한 번 누를 때의 다음 상태
export function nextOverrideState(state: OverrideState): OverrideState {
  if (state === 'inherit') return 'grant'
  if (state === 'grant') return 'deny'
  return 'inherit'
}

// 한 코드의 현재 상태
export function overrideStateOf(overrides: Overrides, code: PermissionCode): OverrideState {
  if (overrides.grants.includes(code)) return 'grant'
  if (overrides.denies.includes(code)) return 'deny'
  return 'inherit'
}

// 한 코드의 상태 바꾸기 (추가·제외 목록 중 한 곳에만 들어간다)
export function setOverrideState(
  overrides: Overrides,
  code: PermissionCode,
  state: OverrideState,
): Overrides {
  const grants = overrides.grants.filter((c) => c !== code)
  const denies = overrides.denies.filter((c) => c !== code)
  if (state === 'grant') grants.push(code)
  if (state === 'deny') denies.push(code)
  return { grants, denies }
}

const menuOf = (code: PermissionCode) => code.slice(0, code.lastIndexOf('.')) as PermissionMenu

// 이 사용자 유형에게 추가·제외할 수 있는 코드: 자기 영역 + (운영사가 아니면) 시스템 메뉴 제외
export function overridableCodes(userType: UserTypeValue): PermissionCode[] {
  const area = areaOf(userType)
  return ALL_PERMISSION_CODES.filter(
    (code) =>
      PERMISSION_MENUS[menuOf(code)].area === area &&
      (userType === 'OPERATOR' || !isOperatorOnly(code)),
  )
}

// 저장 전 검사 (서버에서 다시 확인): 문제가 있으면 안내 문구, 없으면 null
export function overridesIssue(
  userType: UserTypeValue,
  grants: readonly string[],
  denies: readonly string[],
): string | null {
  const allowed = new Set<string>(overridableCodes(userType))
  for (const code of [...grants, ...denies]) {
    if (!isPermissionCode(code)) return `알 수 없는 권한 코드입니다: ${code}`
    if (!allowed.has(code)) return `이 사용자 유형에게 줄 수 없는 권한입니다: ${code}`
  }
  const grantSet = new Set(grants)
  const both = denies.find((code) => grantSet.has(code))
  if (both) return `같은 권한을 추가와 제외에 동시에 넣을 수 없습니다: ${both}`
  return null
}
