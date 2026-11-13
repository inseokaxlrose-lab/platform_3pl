// 사용자 유형별 영역·홈과, 로그인 후 돌아갈 주소 검사 (브라우저·서버 공용, 순수 함수)

export type UserTypeValue = 'OPERATOR' | 'CENTER' | 'SHIPPER'
export type Area = 'admin' | 'portal'

// 영역: 운영사·센터 직원 → 운영사 화면, 화주사 사용자 → 화주 포털
export function areaOf(userType: UserTypeValue): Area {
  return userType === 'SHIPPER' ? 'portal' : 'admin'
}

export function homeOf(userType: UserTypeValue) {
  return `/${areaOf(userType)}`
}

// 로그인 후 돌아갈 주소(?next=) 검사
// - 우리 사이트 안의 주소만: '/'로 시작하고 '//'·'/\'로 시작하지 않음 (다른 사이트로 보내는 공격 방지)
// - 자기 영역의 주소만: 화주사 사용자가 /admin 주소로 가지 않게
// - 조건에 맞지 않으면 자기 영역 홈
export function safeNextPath(next: string | null | undefined, userType: UserTypeValue) {
  const home = homeOf(userType)
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return home
  }
  const path = next.split(/[?#]/)[0]
  return path === home || path.startsWith(`${home}/`) ? next : home
}
