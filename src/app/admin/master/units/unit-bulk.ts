// 고른 줄의 상태로 일괄 버튼을 켜고 끈다 (0079) — 꺼진 이유는 버튼에 마우스를 올리면 보인다
// lockedCodes: 사용 중지할 수 없는 단위 (EA·BOX·PLT + 운영사 중량·길이 표시 단위)
export function bulkAvailability(
  rows: { code: string; isActive: boolean; isSystem: boolean }[],
  lockedCodes: readonly string[],
) {
  const locked = rows.filter((r) => lockedCodes.includes(r.code)).map((r) => r.code)
  const system = rows.filter((r) => r.isSystem).map((r) => r.code)
  return {
    deactivate:
      rows.length === 0
        ? '단위를 골라 주세요'
        : locked.length > 0
          ? `${locked.join('·')}는 사용 중지할 수 없습니다`
          : rows.some((r) => r.isActive)
            ? null
            : '이미 모두 사용 중지 상태입니다',
    activate:
      rows.length === 0
        ? '단위를 골라 주세요'
        : rows.some((r) => !r.isActive)
          ? null
          : '이미 모두 사용 중입니다',
    delete:
      rows.length === 0
        ? '단위를 골라 주세요'
        : system.length > 0
          ? `시스템 기본 단위(${system.join('·')})는 지울 수 없습니다`
          : null,
  }
}
