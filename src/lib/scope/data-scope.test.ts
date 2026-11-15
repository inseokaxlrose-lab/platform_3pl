import { describe, expect, it } from 'vitest'
import { ActionError } from '@/lib/actions/action-error'
import {
  assertInScope,
  computeScope,
  isInScope,
  operatorFilter,
  ScopeFieldMissingError,
  scopeFilter,
  type DataScope,
} from './data-scope'

// 키는 bigint (이름 대신 알아보기 쉽게 상수로)
const OP = 1n // 내 운영사
const OTHER_OP = 2n // 다른 운영사
const ICN = 1n
const PUS = 2n
const GMP = 3n
const GMH = 4n
const GANA = 11n
const DARA = 12n
const S1 = 21n
const S2 = 22n

const active = (id: bigint) => ({ id, isActive: true })

// 자주 쓰는 범위
const all: DataScope = { kind: 'ALL', operatorId: OP }
const centersOf = (...centerIds: bigint[]): DataScope => ({
  kind: 'CENTERS',
  operatorId: OP,
  centerIds,
})
const shipperOf = (shipperId: bigint): DataScope => ({ kind: 'SHIPPER', operatorId: OP, shipperId })
const none: DataScope = { kind: 'NONE' }

describe('computeScope (데이터 범위 계산)', () => {
  const base = { operatorId: OP, isActive: true, centers: [], shipper: null }

  it('운영사 관리자는 자기 운영사 전체', () => {
    expect(computeScope({ ...base, userType: 'OPERATOR' })).toEqual(all)
  })

  it('센터 직원은 소속 센터 (사용 중지된 센터는 제외)', () => {
    expect(
      computeScope({
        ...base,
        userType: 'CENTER',
        centers: [active(ICN), { id: PUS, isActive: false }, active(GMP)],
      }),
    ).toEqual(centersOf(ICN, GMP))
  })

  it('소속 센터가 없는(또는 모두 사용 중지된) 센터 직원은 아무것도 볼 수 없다 (운영사는 기억)', () => {
    const noneOfOp = { kind: 'NONE', operatorId: OP }
    expect(computeScope({ ...base, userType: 'CENTER' })).toEqual(noneOfOp)
    expect(
      computeScope({ ...base, userType: 'CENTER', centers: [{ id: ICN, isActive: false }] }),
    ).toEqual(noneOfOp)
  })

  it('화주사 사용자는 자기 화주사 (화주사가 사용 중지면 NONE)', () => {
    expect(computeScope({ ...base, userType: 'SHIPPER', shipper: active(GANA) })).toEqual(
      shipperOf(GANA),
    )
    expect(
      computeScope({ ...base, userType: 'SHIPPER', shipper: { id: GANA, isActive: false } }),
    ).toEqual({ kind: 'NONE', operatorId: OP })
  })

  it('사용 중지 계정은 운영사 관리자여도 NONE', () => {
    expect(computeScope({ ...base, isActive: false, userType: 'OPERATOR' })).toEqual({
      kind: 'NONE',
      operatorId: OP,
    })
  })
})

const fields = { center: 'centerId', shipper: 'shipperId' }

describe('scopeFilter (목록 조회 조건)', () => {
  it('유형별 조건: 항상 운영사 조건 + 센터·화주사 조건', () => {
    expect(scopeFilter(all, fields)).toEqual({ operatorId: OP })
    expect(scopeFilter(centersOf(ICN), fields)).toEqual({
      operatorId: OP,
      centerId: { in: [ICN] },
    })
    expect(scopeFilter(shipperOf(GANA), fields)).toEqual({ operatorId: OP, shipperId: GANA })
    expect(scopeFilter(none, fields)).toEqual({ centerId: { in: [] } })
  })

  it('관계를 거치는 칸은 점으로 (로케이션 → 창고 → 센터)', () => {
    expect(scopeFilter(centersOf(ICN), { center: 'warehouse.centerId' })).toEqual({
      operatorId: OP,
      warehouse: { centerId: { in: [ICN] } },
    })
  })

  it('운영사 칸도 관계를 거칠 수 있고, 같은 관계는 안쪽까지 합친다', () => {
    expect(
      scopeFilter(centersOf(ICN), { center: 'zone.centerId', operator: 'zone.operatorId' }),
    ).toEqual({ zone: { operatorId: OP, centerId: { in: [ICN] } } })
  })

  it('필요한 칸이 지정되지 않으면 조건 없이 조회하지 않고 오류', () => {
    expect(() => scopeFilter(shipperOf(GANA), { center: 'centerId' })).toThrow(
      ScopeFieldMissingError,
    )
    expect(() => scopeFilter(centersOf(ICN), { shipper: 'shipperId' })).toThrow(
      ScopeFieldMissingError,
    )
  })

  it('볼 수 없는 사용자(NONE)는 칸이 없어도 0건 조건 (운영사 칸으로)', () => {
    expect(scopeFilter(none, {})).toEqual({ operatorId: { in: [] } })
  })
})

describe('operatorFilter (운영사 공통 데이터)', () => {
  it('운영사 조건만, NONE은 0건', () => {
    expect(operatorFilter(all)).toEqual({ operatorId: OP })
    expect(operatorFilter(centersOf(ICN))).toEqual({ operatorId: OP })
    expect(operatorFilter({ kind: 'NONE', operatorId: OP })).toEqual({ operatorId: { in: [] } })
  })
})

describe('isInScope / assertInScope (한 건 검사)', () => {
  const record = {
    operatorId: OP,
    centerId: ICN,
    shipperId: GANA,
    warehouse: { centerId: ICN },
  }

  it('범위 안이면 통과', () => {
    expect(isInScope(all, record, fields)).toBe(true)
    expect(isInScope(centersOf(ICN), record, fields)).toBe(true)
    expect(isInScope(shipperOf(GANA), record, fields)).toBe(true)
    expect(isInScope(centersOf(ICN), record, { center: 'warehouse.centerId' })).toBe(true)
  })

  it('범위 밖이면 "찾을 수 없음"으로 막는다 (존재 여부를 알리지 않음)', () => {
    const other = { operatorId: OP, centerId: PUS, shipperId: DARA }
    expect(isInScope(centersOf(ICN), other, fields)).toBe(false)
    expect(() => assertInScope(centersOf(ICN), other, fields)).toThrow(ActionError)
    expect(() => assertInScope(shipperOf(GANA), other, fields)).toThrow('대상을 찾을 수 없습니다.')
    expect(() => assertInScope(none, record, fields)).toThrow(ActionError)
  })

  it('다른 운영사의 줄은 운영사 관리자(전체)에게도 범위 밖', () => {
    const otherOperator = { ...record, operatorId: OTHER_OP }
    expect(isInScope(all, otherOperator, fields)).toBe(false)
    expect(isInScope(centersOf(ICN), otherOperator, fields)).toBe(false)
  })

  it('운영사 칸을 읽지 않은 줄은 범위 밖으로 본다 (막는 쪽)', () => {
    expect(isInScope(all, { centerId: ICN }, fields)).toBe(false)
  })

  it('대상이 없으면(null) 같은 "찾을 수 없음"', () => {
    expect(() => assertInScope(all, null, fields)).toThrow('대상을 찾을 수 없습니다.')
  })
})

describe('여러 개와 연결된 관계 (some)', () => {
  const fields = { center: 'centers.some.centerId', shipper: 'id' }
  const shipper = { operatorId: OP, id: S1, centers: [{ centerId: ICN }, { centerId: GMH }] }

  it('목록 조건: 연결된 센터 중 하나라도 소속 센터', () => {
    expect(scopeFilter(centersOf(ICN), fields)).toEqual({
      operatorId: OP,
      centers: { some: { centerId: { in: [ICN] } } },
    })
  })

  it('한 건 검사: 연결된 센터 중 하나라도 소속이면 범위 안', () => {
    expect(isInScope(centersOf(GMH), shipper, fields)).toBe(true)
    expect(isInScope(centersOf(PUS), shipper, fields)).toBe(false)
    expect(isInScope(centersOf(ICN), { operatorId: OP, id: S2, centers: [] }, fields)).toBe(false)
    expect(isInScope(shipperOf(S1), shipper, fields)).toBe(true)
  })
})
