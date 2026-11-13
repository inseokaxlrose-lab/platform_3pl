import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ALL_PERMISSION_CODES,
  isPermissionCode,
  menuReadPermission,
  PERMISSION_ACTION_LABELS,
  PERMISSION_MENUS,
  type PermissionCode,
} from './permissions'

describe('권한 코드 목록', () => {
  it('형식: 소문자 단어를 점으로 잇고(하이픈 허용), 마지막은 동작', () => {
    for (const code of ALL_PERMISSION_CODES) {
      expect(code).toMatch(/^[a-z]+(\.[a-z]+(-[a-z]+)*)+$/)
    }
  })

  it('중복이 없다', () => {
    expect(new Set(ALL_PERMISSION_CODES).size).toBe(ALL_PERMISSION_CODES.length)
  })

  it('모든 메뉴에 조회(read) 권한이 있다 (메뉴 접근 권한)', () => {
    for (const [menu, definition] of Object.entries(PERMISSION_MENUS)) {
      expect(definition.actions, menu).toContain('read')
    }
  })

  it('모든 동작에 한글 이름표가 있다', () => {
    for (const definition of Object.values(PERMISSION_MENUS)) {
      for (const action of definition.actions) {
        expect(PERMISSION_ACTION_LABELS[action]).toBeTruthy()
      }
    }
  })

  it('포털 메뉴는 portal. 으로, 운영사 화면 메뉴는 그 외로 시작한다', () => {
    for (const [menu, definition] of Object.entries(PERMISSION_MENUS)) {
      expect(menu.startsWith('portal.'), menu).toBe(definition.area === 'portal')
    }
  })

  it('업무 규칙: 잔량 마감과 재고 조정 확정은 별도 권한이다', () => {
    expect(ALL_PERMISSION_CODES).toContain('inbound.asn.close')
    expect(ALL_PERMISSION_CODES).toContain('stock.adjustments.create')
    expect(ALL_PERMISSION_CODES).toContain('stock.adjustments.confirm')
  })
})

describe('isPermissionCode', () => {
  it('목록에 있는 코드만 인정한다', () => {
    expect(isPermissionCode('inbound.asn.create')).toBe(true)
    expect(isPermissionCode('inbound.asn.creat')).toBe(false)
    expect(isPermissionCode('inbound.asn')).toBe(false)
    expect(isPermissionCode('')).toBe(false)
  })
})

describe('타입', () => {
  it('menuReadPermission은 메뉴의 조회 코드를 만든다', () => {
    expect(menuReadPermission('inbound.asn')).toBe('inbound.asn.read')
    expectTypeOf<'inbound.asn.create'>().toExtend<PermissionCode>()
    // @ts-expect-error 목록에 없는 동작은 타입 오류
    const wrong: PermissionCode = 'inbound.labels.delete'
    expect(wrong).toBeTruthy()
  })
})
