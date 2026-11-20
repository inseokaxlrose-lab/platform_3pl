import { describe, expect, it } from 'vitest'
import { contractSchema, type ContractInput } from './contract-schema'

// 운송 계약 입력 규칙 (0094)
const base: ContractInput = {
  carrierId: '1',
  centerId: '2',
  shipperId: '',
  custNo: 'C-1001',
  pickupBranch: '',
  invoiceStart: '',
  invoiceEnd: '',
  invoiceNext: '',
  isDefault: false,
  validFrom: '',
  validTo: '',
  status: 'ACTIVE',
  remark: '',
}
const errorsOf = (input: Partial<ContractInput>) => {
  const result = contractSchema.safeParse({ ...base, ...input })
  return result.success ? {} : result.error.flatten().fieldErrors
}

describe('운송 계약 입력 규칙', () => {
  it('화주를 비우면 센터 공용 (null), 대역 하이픈은 지우고 다음 번호는 비워도 된다', () => {
    const parsed = contractSchema.parse({
      ...base,
      invoiceStart: '6000-0000-000',
      invoiceEnd: '60000009999',
    })
    expect(parsed.shipperId).toBeNull()
    expect(parsed.invoiceStart).toBe('60000000000')
    expect(parsed.invoiceNext).toBeNull()
  })

  it('대역은 시작·끝을 함께, 같은 자릿수, 시작 ≤ 끝', () => {
    expect(errorsOf({ invoiceStart: '100' })).toHaveProperty('invoiceEnd')
    expect(errorsOf({ invoiceStart: '100', invoiceEnd: '1000' })).toHaveProperty('invoiceEnd')
    expect(errorsOf({ invoiceStart: '200', invoiceEnd: '100' })).toHaveProperty('invoiceEnd')
  })

  it('다음 번호는 시작 ~ 끝+1 (다 쓴 상태까지), 대역 없이 다음 번호만은 안 된다', () => {
    expect(errorsOf({ invoiceStart: '100', invoiceEnd: '199', invoiceNext: '200' })).toEqual({})
    expect(errorsOf({ invoiceStart: '100', invoiceEnd: '199', invoiceNext: '201' })).toHaveProperty(
      'invoiceNext',
    )
    expect(errorsOf({ invoiceNext: '100' })).toHaveProperty('invoiceNext')
  })

  it('유효기간 종료일은 시작일보다 빠를 수 없다', () => {
    expect(errorsOf({ validFrom: '2026-12-01', validTo: '2026-11-30' })).toHaveProperty('validTo')
  })
})
