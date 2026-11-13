// 사용자 유형별 소속 규칙 (등록·수정 공용, 0016)
// - 센터 직원: 소속 센터 1개 이상, 화주사 없음
// - 화주사 사용자: 소속 화주사 1개, 센터 없음
// - 운영사: 소속 없음
export type AffiliationIssue = { path: 'centerIds' | 'shipperId'; message: string }

export function affiliationIssues(
  userType: 'OPERATOR' | 'CENTER' | 'SHIPPER',
  centerIds: readonly string[],
  shipperId: string | null | undefined,
): AffiliationIssue[] {
  const issues: AffiliationIssue[] = []
  if (userType === 'CENTER' && centerIds.length === 0) {
    issues.push({ path: 'centerIds', message: '센터 직원은 소속 센터를 1개 이상 선택해야 합니다.' })
  }
  if (userType !== 'CENTER' && centerIds.length > 0) {
    issues.push({ path: 'centerIds', message: '소속 센터는 센터 직원만 가질 수 있습니다.' })
  }
  if (userType === 'SHIPPER' && !shipperId) {
    issues.push({ path: 'shipperId', message: '화주사 사용자는 소속 화주사를 선택해야 합니다.' })
  }
  if (userType !== 'SHIPPER' && shipperId) {
    issues.push({ path: 'shipperId', message: '소속 화주사는 화주사 사용자만 가질 수 있습니다.' })
  }
  return issues
}

// 이메일이 없는 사용자의 내부용 주소 (Better Auth는 이메일 칸이 필수)
export function internalEmail(username: string) {
  return `${username.toLowerCase()}@users.local`
}
