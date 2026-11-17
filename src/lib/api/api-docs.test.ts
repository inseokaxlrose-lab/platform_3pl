import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { API_ERRORS } from './api-errors'

// 오류코드 문서(docs/api-error-codes.md)와 코드 카탈로그가 같은지 (0081)
describe('API 오류코드 문서', () => {
  it('모든 코드가 같은 HTTP 상태·분류로 문서에 있다', () => {
    const doc = readFileSync('docs/api-error-codes.md', 'utf8')
    for (const [code, def] of Object.entries(API_ERRORS)) {
      expect(doc, code).toContain(`| \`${code}\` | ${def.status} | ${def.category} |`)
    }
    const documented = [...doc.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((m) => m[1])
    expect(documented.sort()).toEqual(Object.keys(API_ERRORS).sort())
  })
})
