import { z } from 'zod'

// 엑셀 업로드 공통 규칙 (docs/decisions/0049, 0003 "엑셀 업로드 공통 규칙") — 화면·서버 공용, 순수 함수
// 양식 내려받기 → 파일 고르기 → 서버 검증 결과 미리보기(오류 행·사유) → 오류가 하나도 없을 때만 등록
// 오류가 하나라도 있으면 그 파일은 등록하지 않는다 (일부만 들어가는 혼란 방지)

// 한 번에 올릴 수 있는 행 수 (실수로 큰 파일을 올려 오래 멈추는 것을 막는다)
export const MAX_UPLOAD_ROWS = 1000
// 파일 크기 한도 (5MB)
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

// 양식의 한 칸
export type UploadColumn = {
  key: string
  // 엑셀 첫 줄 제목 (이 글자로 칸을 찾는다. 필수 칸은 양식에 '*'가 붙지만 없어도 된다)
  header: string
  required?: boolean
  // 안내 시트에 적을 예시·설명
  example?: string
  note?: string
  // 엑셀 칸 너비 (글자 수)
  width?: number
}

export type UploadTemplate = {
  // 파일 이름 앞부분 (예: 'ASN업로드' → ASN업로드_양식.xlsx)
  name: string
  columns: UploadColumn[]
  // 안내 시트 맨 위에 적을 설명 줄
  guide?: string[]
}

// 엑셀 한 행 = 행 번호(엑셀에서 보이는 번호) + 칸별 글자
export type UploadRow = { rowNo: number; values: Record<string, string> }

// 검증 문제 하나 (column: 칸 key, 없으면 행 전체)
export type UploadIssue = { rowNo: number; column?: string; message: string }

// 미리보기: 행마다 오류 문구
export type UploadPreviewRow = UploadRow & { errors: string[] }
export type UploadPreview = { rows: UploadPreviewRow[]; errorCount: number; summary: string }

// 서버 액션 입력 규칙 (화면이 읽은 행을 그대로 보낸다)
export const uploadRowsSchema = z
  .array(
    z.object({
      rowNo: z.number().int().positive(),
      values: z.record(z.string(), z.string().max(1000)),
    }),
  )
  .min(1, '올릴 행이 없습니다.')
  .max(MAX_UPLOAD_ROWS, `한 번에 ${MAX_UPLOAD_ROWS}행까지 올릴 수 있습니다.`)

// 제목 비교: 공백·'*' 무시 (예: '품목코드 *' = '품목코드')
const normalizeHeader = (text: string) => text.replace(/\*/g, '').replace(/\s+/g, '').trim()

// 엑셀 칸 값 → 글자 (exceljs 값 모양: 글자·숫자·날짜·서식 글자·수식 결과·하이퍼링크·참/거짓)
// 날짜는 'YYYY-MM-DD' (엑셀 날짜는 시간대 없이 그 날짜 → UTC 기준으로 읽는다)
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'Y' : 'N'
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object') {
    const v = value as {
      richText?: { text: string }[]
      text?: unknown
      result?: unknown
      error?: unknown
    }
    if (Array.isArray(v.richText))
      return v.richText
        .map((part) => part.text)
        .join('')
        .trim()
    if ('result' in v) return cellText(v.result)
    if ('text' in v) return cellText(v.text)
    if ('error' in v) return ''
  }
  return String(value).trim()
}

// 읽은 표(첫 줄 = 제목) → 행 목록. 제목으로 칸을 찾고, 빈 행은 건너뛴다
// 오류: 필수 칸 제목이 없음 / 행이 없음 / 너무 많음
export function mapRows(
  template: UploadTemplate,
  table: string[][],
): { rows: UploadRow[]; error?: string } {
  if (table.length === 0) return { rows: [], error: '빈 파일입니다.' }
  const header = table[0].map((text) => normalizeHeader(text ?? ''))
  const indexOf = new Map<string, number>()
  for (const column of template.columns) {
    const index = header.indexOf(normalizeHeader(column.header))
    if (index >= 0) indexOf.set(column.key, index)
  }
  const missing = template.columns.filter((c) => c.required && !indexOf.has(c.key))
  if (missing.length > 0) {
    return {
      rows: [],
      error: `양식의 제목 줄에 필수 칸이 없습니다: ${missing.map((c) => c.header).join(', ')}. 양식을 내려받아 그대로 써 주세요.`,
    }
  }
  const rows: UploadRow[] = []
  table.slice(1).forEach((cells, offset) => {
    const values: Record<string, string> = {}
    for (const column of template.columns) {
      const index = indexOf.get(column.key)
      values[column.key] = index === undefined ? '' : (cells[index] ?? '').trim()
    }
    if (Object.values(values).some((v) => v !== '')) rows.push({ rowNo: offset + 2, values })
  })
  if (rows.length === 0) return { rows, error: '올릴 행이 없습니다. 제목 아래 줄부터 채워 주세요.' }
  if (rows.length > MAX_UPLOAD_ROWS) {
    return {
      rows: [],
      error: `한 번에 ${MAX_UPLOAD_ROWS}행까지 올릴 수 있습니다 (지금 ${rows.length}행). 나눠서 올려 주세요.`,
    }
  }
  return { rows }
}

// 필수 칸 비었는지 (서버 검증의 첫 단계로 쓴다)
export function requiredIssues(template: UploadTemplate, rows: UploadRow[]): UploadIssue[] {
  return rows.flatMap((row) =>
    template.columns
      .filter((c) => c.required && !row.values[c.key])
      .map((c) => ({ rowNo: row.rowNo, column: c.key, message: `${c.header}을(를) 넣어 주세요.` })),
  )
}

// 행 + 문제 목록 → 미리보기 (칸 이름을 앞에 붙인 문구)
export function buildPreview(
  template: UploadTemplate,
  rows: UploadRow[],
  issues: UploadIssue[],
  summary?: string,
): UploadPreview {
  const headerOf = new Map(template.columns.map((c) => [c.key, c.header]))
  const byRow = new Map<number, string[]>()
  for (const issue of issues) {
    const label = issue.column ? headerOf.get(issue.column) : undefined
    const text = label ? `[${label}] ${issue.message}` : issue.message
    byRow.set(issue.rowNo, [...(byRow.get(issue.rowNo) ?? []), text])
  }
  const preview = rows.map((row) => ({ ...row, errors: byRow.get(row.rowNo) ?? [] }))
  const errorCount = preview.filter((row) => row.errors.length > 0).length
  return {
    rows: preview,
    errorCount,
    summary:
      summary ??
      (errorCount === 0
        ? `${rows.length}행 모두 올바릅니다.`
        : `${rows.length}행 중 ${errorCount}행에 오류가 있습니다. 고친 뒤 다시 올려 주세요.`),
  }
}
