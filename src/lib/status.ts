// 기준정보 상태 (docs/db-conventions.md 공통 칸 status_cd): 'ACTIVE' 사용 / 'INACTIVE' 사용 중지
// 프로그램이 값에 따라 동작을 바꾸므로 공통코드가 아니라 고정 값 (0030)
// 화면·입력 규칙은 지금처럼 사용 여부 true/false로 쓰고, DB에 쓰고 읽는 곳에서만 바꾼다
export const STATUS = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const
export type Status = (typeof STATUS)[keyof typeof STATUS]

// 사용 여부 → 상태 (DB에 저장할 때)
export function toStatus(isActive: boolean): Status {
  return isActive ? STATUS.ACTIVE : STATUS.INACTIVE
}

// 상태 → 사용 여부 (DB에서 읽을 때). 'ACTIVE'만 사용 중
export function isActiveStatus(status: string): boolean {
  return status === STATUS.ACTIVE
}

// 조회 조건: 사용 중인 것만 (예: where: { ...ACTIVE_ONLY })
export const ACTIVE_ONLY = { status: STATUS.ACTIVE } as const

// 화면으로 보낼 줄: status 대신 사용 여부 isActive (화면 코드는 지금처럼 true/false)
// 예) rows.map(withIsActive)
export function withIsActive<T extends { status: string }>({
  status,
  ...rest
}: T): Omit<T, 'status'> & { isActive: boolean } {
  return { ...rest, isActive: isActiveStatus(status) }
}

// DB에 저장할 값: 입력의 사용 여부 isActive 대신 status (withIsActive의 반대)
// 예) prisma.unit.create({ data: withStatus(data) })
export function withStatus<T extends { isActive: boolean }>({
  isActive,
  ...rest
}: T): Omit<T, 'isActive'> & { status: Status } {
  return { ...rest, status: toStatus(isActive) }
}
