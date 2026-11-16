// 유통기한 상태 (docs/decisions/0060) — 화면·서버 공용, 순수 함수
// 남은 일수 = 유통기한 − 오늘(한국 날짜). 0 미만이면 만료, 품목의 임박 기준 일수 이하면 임박
// 품목에 임박 기준이 없으면 임박은 표시하지 않는다 (만료만)

export type ExpiryStateValue = 'NONE' | 'OK' | 'SOON' | 'EXPIRED'

// 한국 시간 오늘 'YYYY-MM-DD'
export function kstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function expiryState(
  expiryOn: Date | string | null,
  alertDays: number | null,
  today: string,
): { state: ExpiryStateValue; daysLeft: number | null } {
  if (!expiryOn) return { state: 'NONE', daysLeft: null }
  const day = typeof expiryOn === 'string' ? expiryOn : expiryOn.toISOString().slice(0, 10)
  const daysLeft = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  )
  if (daysLeft < 0) return { state: 'EXPIRED', daysLeft }
  if (alertDays !== null && daysLeft <= alertDays) return { state: 'SOON', daysLeft }
  return { state: 'OK', daysLeft }
}
