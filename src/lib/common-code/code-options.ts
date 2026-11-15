// 화면에 나눠 주는 공통코드 목록의 모양 — 화면·서버 공용 순수 함수 (docs/decisions/0030)

export type CodeOption = {
  code: string
  name: string
  // false = 사용 중지: 새로 고르는 목록에서는 숨기고, 이미 저장된 값은 이름으로 보여준다
  isActive: boolean
}

// 그룹 코드 → 코드 목록 (정렬 순서대로)
export type CodeOptions = Readonly<Record<string, readonly CodeOption[]>>

// 고를 수 있는 코드: 사용 중인 코드 + (사용 중지됐어도) 지금 저장된 값
export function selectableCodes(options: readonly CodeOption[], currentValue?: string | null) {
  return options.filter((option) => option.isActive || option.code === currentValue)
}

// 코드 → 이름 (없는 코드는 코드 글자 그대로: 그룹을 지웠거나 잘못 저장된 값도 화면이 깨지지 않게)
export function codeName(options: readonly CodeOption[] | undefined, code: string | null) {
  if (!code) return ''
  return options?.find((option) => option.code === code)?.name ?? code
}
