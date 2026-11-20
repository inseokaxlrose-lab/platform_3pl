// 제조일·유통기한 정하기 (0089) — 화면·서버 공용 순수 함수
// 품목의 기한 입력 방식(EXPIRY_INPUT)에 따라:
// - EXPIRY(기한일 입력): 유통기한 필수, 제조일은 알면 넣는다(선택)
// - MFG(제조일 입력): 제조일 필수, 유통기한 = 제조일 + 총 기한 일수(shelfLifeDays) — 넣은 유통기한은 쓰지 않는다
// - BOTH(둘 다): 둘 다 필수
// 모든 방식: 제조일은 유통기한보다 늦을 수 없다. 유통기한을 관리하지 않는 품목은 둘 다 비운다
// required=false(ASN 예정 정보)면 필수 검사만 건너뛰고, 넣은 값은 같은 규칙으로 계산·검사한다

export type ExpiryRule = {
  useExpiry: boolean
  // 비어 있으면 EXPIRY로 본다 (화주사 기본값으로 기한을 관리하는 품목)
  expiryInput: string | null
  shelfLifeDays: number | null
}

export type ExpiryDates = { expiryOn: string | null; mfgOn: string | null }
export type ExpiryIssue = { field: 'expiryOn' | 'mfgOn'; message: string }

// 'YYYY-MM-DD' + n일
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// 제조일 입력 방식인지 (화면에서 유통기한 칸을 계산 결과로 잠글 때)
export const isMfgInput = (rule: ExpiryRule) =>
  rule.useExpiry && rule.expiryInput === 'MFG' && rule.shelfLifeDays !== null

export function resolveExpiryDates(
  rule: ExpiryRule,
  input: { expiryOn?: string | null; mfgOn?: string | null },
  required = true,
): { dates: ExpiryDates; issue: null } | { dates: null; issue: ExpiryIssue } {
  const fail = (field: ExpiryIssue['field'], message: string) => ({
    dates: null,
    issue: { field, message },
  })
  const expiry = input.expiryOn?.trim() || null
  const mfg = input.mfgOn?.trim() || null
  if (!rule.useExpiry) {
    if (expiry) return fail('expiryOn', '유통기한을 관리하지 않는 품목입니다.')
    if (mfg) return fail('mfgOn', '유통기한을 관리하지 않는 품목이라 제조일을 넣지 않습니다.')
    return { dates: { expiryOn: null, mfgOn: null }, issue: null }
  }
  const mode = rule.expiryInput ?? 'EXPIRY'
  let expiryOn = expiry
  if (mode === 'MFG' && rule.shelfLifeDays !== null) {
    if (!mfg) {
      return required
        ? fail('mfgOn', '제조일을 넣어 주세요 (제조일 입력 품목).')
        : { dates: { expiryOn: null, mfgOn: null }, issue: null }
    }
    expiryOn = addDays(mfg, rule.shelfLifeDays)
  } else if (required && !expiry) {
    return fail('expiryOn', '유통기한을 넣어 주세요 (유통기한 관리 품목).')
  }
  if (mode === 'BOTH' && required && !mfg) {
    return fail('mfgOn', '제조일을 넣어 주세요 (제조일·유통기한 모두 입력 품목).')
  }
  if (mfg && expiryOn && mfg > expiryOn) {
    return fail('mfgOn', '제조일이 유통기한보다 늦습니다.')
  }
  return { dates: { expiryOn, mfgOn: mfg }, issue: null }
}
