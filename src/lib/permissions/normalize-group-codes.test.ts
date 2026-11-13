import { describe, expect, it } from 'vitest'
import { normalizeGroupCodes } from './normalize-group-codes'

describe('normalizeGroupCodes (권한그룹 저장 전 정리)', () => {
  it('버튼 권한이 있으면 그 메뉴의 조회를 넣고, 목록 순서로 정렬한다', () => {
    expect(
      normalizeGroupCodes(['inbound.asn.close', 'master.centers.create'], 'admin').codes,
    ).toEqual([
      'master.centers.read',
      'master.centers.create',
      'inbound.asn.read',
      'inbound.asn.close',
    ])
  })

  it('다른 영역·목록에 없는 코드는 빼고 알려준다', () => {
    const result = normalizeGroupCodes(
      ['portal.asn.read', 'inbound.asn.read', 'old.menu.read', 'old.menu.read'],
      'portal',
    )
    expect(result.codes).toEqual(['portal.asn.read'])
    expect(result.dropped).toEqual(['inbound.asn.read', 'old.menu.read'])
  })

  it('중복은 하나로', () => {
    expect(
      normalizeGroupCodes(['stock.history.read', 'stock.history.read'], 'admin').codes,
    ).toEqual(['stock.history.read'])
  })
})
