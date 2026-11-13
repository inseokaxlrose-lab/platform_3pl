import { describe, expect, it } from 'vitest'
import { areaOf, homeOf, safeNextPath } from './redirect'

describe('영역·홈', () => {
  it('운영사·센터 직원은 운영사 화면, 화주사 사용자는 포털', () => {
    expect(areaOf('OPERATOR')).toBe('admin')
    expect(areaOf('CENTER')).toBe('admin')
    expect(areaOf('SHIPPER')).toBe('portal')
    expect(homeOf('SHIPPER')).toBe('/portal')
  })
})

describe('safeNextPath (로그인 후 돌아갈 주소)', () => {
  it('자기 영역 안의 주소는 그대로 (검색 조건 포함)', () => {
    expect(safeNextPath('/admin/stock?search=김치', 'CENTER')).toBe('/admin/stock?search=김치')
    expect(safeNextPath('/portal', 'SHIPPER')).toBe('/portal')
  })

  it('다른 사이트로 보내는 주소는 거부하고 홈으로', () => {
    expect(safeNextPath('https://evil.example', 'CENTER')).toBe('/admin')
    expect(safeNextPath('//evil.example/admin', 'CENTER')).toBe('/admin')
    expect(safeNextPath('/\\evil.example', 'CENTER')).toBe('/admin')
  })

  it('다른 영역 주소는 거부하고 자기 홈으로', () => {
    expect(safeNextPath('/admin/stock', 'SHIPPER')).toBe('/portal')
    expect(safeNextPath('/portal/asn', 'OPERATOR')).toBe('/admin')
  })

  it('이름 앞부분만 같은 주소는 다른 영역으로 본다', () => {
    expect(safeNextPath('/administrator', 'CENTER')).toBe('/admin')
  })

  it('없거나 빈 값이면 홈', () => {
    expect(safeNextPath(null, 'CENTER')).toBe('/admin')
    expect(safeNextPath('', 'SHIPPER')).toBe('/portal')
  })
})
