import { describe, expect, it } from 'vitest'
import { ActionError } from '@/lib/actions/action-error'
import {
  assertInScope,
  computeScope,
  isInScope,
  ScopeFieldMissingError,
  scopeFilter,
  type DataScope,
} from './data-scope'

const active = (id: string) => ({ id, isActive: true })

describe('computeScope (데이터 범위 계산)', () => {
  const base = { isActive: true, centers: [], shipper: null }

  it('운영사는 전체', () => {
    expect(computeScope({ ...base, userType: 'OPERATOR' })).toEqual({ kind: 'ALL' })
  })

  it('센터 직원은 소속 센터 (사용 중지된 센터는 제외)', () => {
    expect(
      computeScope({
        ...base,
        userType: 'CENTER',
        centers: [active('ICN'), { id: 'PUS', isActive: false }, active('GMP')],
      }),
    ).toEqual({ kind: 'CENTERS', centerIds: ['ICN', 'GMP'] })
  })

  it('소속 센터가 없는(또는 모두 사용 중지된) 센터 직원은 아무것도 볼 수 없다', () => {
    expect(computeScope({ ...base, userType: 'CENTER' })).toEqual({ kind: 'NONE' })
    expect(
      computeScope({ ...base, userType: 'CENTER', centers: [{ id: 'ICN', isActive: false }] }),
    ).toEqual({ kind: 'NONE' })
  })

  it('화주사 사용자는 자기 화주사 (화주사가 사용 중지면 NONE)', () => {
    expect(computeScope({ ...base, userType: 'SHIPPER', shipper: active('GANA') })).toEqual({
      kind: 'SHIPPER',
      shipperId: 'GANA',
    })
    expect(
      computeScope({ ...base, userType: 'SHIPPER', shipper: { id: 'GANA', isActive: false } }),
    ).toEqual({ kind: 'NONE' })
  })

  it('사용 중지 계정은 운영사여도 NONE', () => {
    expect(computeScope({ ...base, isActive: false, userType: 'OPERATOR' })).toEqual({
      kind: 'NONE',
    })
  })
})

const fields = { center: 'centerId', shipper: 'shipperId' }

describe('scopeFilter (목록 조회 조건)', () => {
  it('유형별 조건', () => {
    expect(scopeFilter({ kind: 'ALL' }, fields)).toEqual({})
    expect(scopeFilter({ kind: 'CENTERS', centerIds: ['ICN'] }, fields)).toEqual({
      centerId: { in: ['ICN'] },
    })
    expect(scopeFilter({ kind: 'SHIPPER', shipperId: 'GANA' }, fields)).toEqual({
      shipperId: 'GANA',
    })
    expect(scopeFilter({ kind: 'NONE' }, fields)).toEqual({ centerId: { in: [] } })
  })

  it('관계를 거치는 칸은 점으로 (로케이션 → 창고 → 센터)', () => {
    expect(
      scopeFilter({ kind: 'CENTERS', centerIds: ['ICN'] }, { center: 'warehouse.centerId' }),
    ).toEqual({ warehouse: { centerId: { in: ['ICN'] } } })
  })

  it('필요한 칸이 지정되지 않으면 조건 없이 조회하지 않고 오류', () => {
    expect(() =>
      scopeFilter({ kind: 'SHIPPER', shipperId: 'GANA' }, { center: 'centerId' }),
    ).toThrow(ScopeFieldMissingError)
    expect(() =>
      scopeFilter({ kind: 'CENTERS', centerIds: ['ICN'] }, { shipper: 'shipperId' }),
    ).toThrow(ScopeFieldMissingError)
    expect(() => scopeFilter({ kind: 'NONE' }, {})).toThrow(ScopeFieldMissingError)
  })
})

describe('isInScope / assertInScope (한 건 검사)', () => {
  const record = { centerId: 'ICN', shipperId: 'GANA', warehouse: { centerId: 'ICN' } }
  const centers: DataScope = { kind: 'CENTERS', centerIds: ['ICN'] }

  it('범위 안이면 통과', () => {
    expect(isInScope({ kind: 'ALL' }, record, fields)).toBe(true)
    expect(isInScope(centers, record, fields)).toBe(true)
    expect(isInScope({ kind: 'SHIPPER', shipperId: 'GANA' }, record, fields)).toBe(true)
    expect(isInScope(centers, record, { center: 'warehouse.centerId' })).toBe(true)
  })

  it('범위 밖이면 "찾을 수 없음"으로 막는다 (존재 여부를 알리지 않음)', () => {
    const other = { centerId: 'PUS', shipperId: 'DARA' }
    expect(isInScope(centers, other, fields)).toBe(false)
    expect(() => assertInScope(centers, other, fields)).toThrow(ActionError)
    expect(() => assertInScope({ kind: 'SHIPPER', shipperId: 'GANA' }, other, fields)).toThrow(
      '대상을 찾을 수 없습니다.',
    )
    expect(() => assertInScope({ kind: 'NONE' }, record, fields)).toThrow(ActionError)
  })

  it('대상이 없으면(null) 같은 "찾을 수 없음"', () => {
    expect(() => assertInScope({ kind: 'ALL' }, null, fields)).toThrow('대상을 찾을 수 없습니다.')
  })
})
