// 시각 'HH:MM' ↔ DB TIME (Prisma는 1970-01-01의 Date로 주고받는다, UTC 기준)

export function timeToDate(value: string | null | undefined): Date | null {
  if (!value) return null
  return new Date(`1970-01-01T${value}:00.000Z`)
}

export function dateToTime(value: Date | null | undefined): string {
  if (!value) return ''
  return value.toISOString().slice(11, 16)
}
