import { isActiveStatus, STATUS, type Status } from '@/lib/status'

// 단위의 실제 사용 여부·소수 자리수 (docs/decisions/0079) — 화면 조회·서버 액션 공용
// - 운영사 추가 단위: 자기 칸 (status_cd·decimal_cnt)
// - 시스템 기본 단위: 그 운영사의 설정(tb_operator_unit)이 있으면 그 값, 없으면 시스템 단위의 값
// 상태: select에 unitStatusSelect(운영사)를 펼쳐 넣고 effectiveUnitStatus로 계산
// 소수 자리수: select에 unitDecimalsSelect(운영사)를 펼쳐 넣고, 조회 결과를 resolveUnitDecimals로 감싼다

// select에 펼쳐 넣는 칸
export const unitStatusSelect = (operatorId: bigint) => ({
  status: true,
  operatorId: true,
  operatorSettings: { where: { operatorId }, select: { status: true, decimals: true } },
})

// 소수 자리수를 읽는 곳: decimals 대신 이것을 펼쳐 넣는다 (예: baseUnit: { select: { code: true, ...unitDecimalsSelect(op) } })
export const unitDecimalsSelect = (operatorId: bigint) => ({
  decimals: true,
  operatorId: true,
  operatorSettings: { where: { operatorId }, select: { status: true, decimals: true } },
})

type DecimalsRow = {
  decimals: number
  operatorId: bigint | null
  operatorSettings: { decimals: number | null }[]
}

export function effectiveUnitDecimals(row: DecimalsRow): number {
  return row.operatorId === null
    ? (row.operatorSettings[0]?.decimals ?? row.decimals)
    : row.decimals
}

// 조회 결과 안의 단위(decimals + operatorSettings를 가진 객체)마다 decimals를 실제 값으로 바꾼다 (깊이 따라감)
// 화면·계산 코드는 지금처럼 unit.decimals를 쓰면 된다
export function resolveUnitDecimals<T>(data: T): T {
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (value === null || typeof value !== 'object' || value instanceof Date) return
    const row = value as Record<string, unknown>
    if (typeof row.decimals === 'number' && Array.isArray(row.operatorSettings)) {
      row.decimals = effectiveUnitDecimals(row as unknown as DecimalsRow)
    }
    for (const key of Object.keys(row)) visit(row[key])
  }
  visit(data)
  return data
}

type StatusRow = {
  status: string
  operatorId: bigint | null
  operatorSettings: { status: string }[]
}

export function effectiveUnitStatus(row: StatusRow): string {
  return row.operatorId === null ? (row.operatorSettings[0]?.status ?? row.status) : row.status
}

export const isUnitActive = (row: StatusRow) => isActiveStatus(effectiveUnitStatus(row))

// 목록 거르기 조건: 실제 상태가 status인 단위 (where의 AND 목록에 넣는다)
export function unitStatusWhere(operatorId: bigint, status: Status) {
  const other = status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE
  return {
    OR: [
      // 운영사 단위: 자기 상태
      { operatorId: { not: null }, status },
      // 시스템 단위: 운영사 설정이 status이거나, 설정이 없고(반대 값이 아니고) 시스템 상태가 status
      { operatorId: null, operatorSettings: { some: { operatorId, status } } },
      {
        operatorId: null,
        status,
        operatorSettings: { none: { operatorId, status: other } },
      },
    ],
  }
}

// 검색 조건의 '상태' 값 → 조건 (사용·사용 중지만, 그 밖은 조건 없음)
export function unitStatusFilter(operatorId: bigint, value: string | undefined) {
  return value === STATUS.ACTIVE || value === STATUS.INACTIVE
    ? unitStatusWhere(operatorId, value)
    : {}
}

// 운영사가 사용 중지할 수 없는 시스템 기본 단위: 프로그램이 직접 쓰는 단위 (기본 수량 EA, 라벨 단위 BOX·PLT)
// 운영사의 중량·길이 표시 단위도 막는다 (units.ts에서 운영사 설정과 함께 검사)
export const ALWAYS_ACTIVE_UNIT_CODES = ['EA', 'BOX', 'PLT'] as const
