// DB 값 목록 칸 읽기 도우미 (docs/decisions/0084 ④-2)
// 값 목록 칸은 VARCHAR + CHECK라 DB가 값을 지키지만, Prisma는 그냥 string으로 준다.
// 그래서 프로그램이 "정해진 값 중 하나"로 다뤄야 하는 곳에서 이 함수로 좁힌다.

// 글자 → 정해진 값 (목록에 없으면 오류 — DB CHECK와 상수가 어긋났다는 뜻)
export function toValue<T extends string>(values: readonly T[], value: string): T {
  if (!(values as readonly string[]).includes(value)) {
    throw new Error(`정해진 값이 아닙니다: ${value} (허용: ${values.join(', ')})`)
  }
  return value as T
}

// NULL 칸용
export function toValueOrNull<T extends string>(
  values: readonly T[],
  value: string | null,
): T | null {
  return value === null ? null : toValue(values, value)
}

// 코드 → 표시 글자 (목록에 없으면 코드 그대로)
export function labelOf(labels: Readonly<Record<string, string>>, value: string): string {
  return labels[value] ?? value
}
