// 예/아니오 칸 (docs/db-conventions.md): DB는 CHAR(1) 'Y'/'N' (검사 조건으로 두 값만)
// 화면·입력 규칙은 true/false 그대로 쓰고, DB에 쓰고 읽는 곳에서만 바꾼다
export type Yn = 'Y' | 'N'

// true/false → 'Y'/'N' (DB에 저장할 때)
export function toYn(value: boolean): Yn {
  return value ? 'Y' : 'N'
}

// 'Y'/'N' → true/false (DB에서 읽을 때). 'Y'만 참
export function isYes(value: string): boolean {
  return value === 'Y'
}
