import { describe, expect, it } from 'vitest'
import { bulkAvailability } from './unit-bulk'

// 단위 목록 일괄 버튼 켜기·끄기 (0079): null = 켜짐, 글자 = 꺼진 이유
const row = (code: string, isActive = true, isSystem = true) => ({ code, isActive, isSystem })
const LOCKED = ['EA', 'BOX', 'PLT', 'KG', 'CM']

describe('bulkAvailability', () => {
  it('사용 중인 EA를 고르면 다시 사용·삭제·사용 중지 모두 꺼짐 (이유와 함께)', () => {
    expect(bulkAvailability([row('EA')], LOCKED)).toEqual({
      deactivate: 'EA는 사용 중지할 수 없습니다',
      activate: '이미 모두 사용 중입니다',
      delete: '시스템 기본 단위(EA)는 지울 수 없습니다',
    })
  })

  it('사용 중인 시스템 단위(LB): 사용 중지만 켜짐 / 사용 중지된 LB: 다시 사용만', () => {
    expect(bulkAvailability([row('LB')], LOCKED)).toMatchObject({
      deactivate: null,
      delete: expect.any(String),
    })
    expect(bulkAvailability([row('LB', false)], LOCKED)).toMatchObject({
      deactivate: '이미 모두 사용 중지 상태입니다',
      activate: null,
    })
  })

  it('운영사 추가 단위는 삭제 가능, 섞여 있으면 할 수 있는 쪽만 켜짐', () => {
    expect(bulkAvailability([row('GN', true, false)], LOCKED)).toEqual({
      deactivate: null,
      activate: '이미 모두 사용 중입니다',
      delete: null,
    })
    expect(bulkAvailability([row('GN', true, false), row('LB', false)], LOCKED)).toMatchObject({
      deactivate: null,
      activate: null,
      delete: expect.stringContaining('LB'),
    })
    expect(bulkAvailability([], LOCKED).delete).toBe('단위를 골라 주세요')
  })
})
