import { describe, expect, it } from 'vitest'
import {
  buildPreview,
  cellText,
  mapRows,
  MAX_UPLOAD_ROWS,
  requiredIssues,
  type UploadTemplate,
} from './upload'
import { buildTemplateXlsx, readXlsxTable } from './xlsx-file'

// 엑셀 업로드 공통 규칙 (0049)

const template: UploadTemplate = {
  name: '테스트',
  columns: [
    { key: 'code', header: '품목코드', required: true },
    { key: 'qty', header: '수량', required: true },
    { key: 'memo', header: '비고' },
  ],
}

describe('cellText (엑셀 칸 값 → 글자)', () => {
  it('글자·숫자·날짜·서식 글자·수식·참거짓·빈 칸', () => {
    expect(cellText('  ABC ')).toBe('ABC')
    expect(cellText(2.5)).toBe('2.5')
    expect(cellText(new Date('2027-01-31T00:00:00Z'))).toBe('2027-01-31')
    expect(cellText({ richText: [{ text: 'A' }, { text: 'B' }] })).toBe('AB')
    expect(cellText({ formula: 'A1*2', result: 48 })).toBe('48')
    expect(cellText({ text: 'link', hyperlink: 'http://x' })).toBe('link')
    expect(cellText(true)).toBe('Y')
    expect(cellText(null)).toBe('')
    expect(cellText({ error: '#N/A' })).toBe('')
  })
})

describe('mapRows (제목으로 칸 찾기)', () => {
  it('칸 순서가 바뀌어도, 제목에 *·공백이 있어도 찾는다. 빈 행은 건너뛰고 행 번호는 엑셀 번호', () => {
    const { rows, error } = mapRows(template, [
      ['수량 *', '품목 코드*', '모르는 칸'],
      ['3', 'A1', 'x'],
      ['', '', ''],
      ['5', 'B2', ''],
    ])
    expect(error).toBeUndefined()
    expect(rows).toEqual([
      { rowNo: 2, values: { code: 'A1', qty: '3', memo: '' } },
      { rowNo: 4, values: { code: 'B2', qty: '5', memo: '' } },
    ])
  })

  it('필수 칸 제목이 없으면, 행이 없으면, 너무 많으면 오류', () => {
    expect(mapRows(template, [['수량'], ['1']]).error).toContain('품목코드')
    expect(mapRows(template, [['품목코드', '수량']]).error).toContain('올릴 행이 없습니다')
    expect(mapRows(template, []).error).toContain('빈 파일')
    const many = [
      ['품목코드', '수량'],
      ...Array.from({ length: MAX_UPLOAD_ROWS + 1 }, () => ['A', '1']),
    ]
    expect(mapRows(template, many).error).toContain(`${MAX_UPLOAD_ROWS}행까지`)
  })
})

describe('검증 결과 미리보기', () => {
  it('필수 칸 검사 + 칸 이름을 붙인 오류 문구, 오류 행 수', () => {
    const rows = [
      { rowNo: 2, values: { code: 'A1', qty: '3', memo: '' } },
      { rowNo: 3, values: { code: '', qty: '', memo: '' } },
    ]
    const issues = [...requiredIssues(template, rows), { rowNo: 2, message: '행 전체 문제' }]
    const preview = buildPreview(template, rows, issues)
    expect(preview.errorCount).toBe(2)
    expect(preview.rows[1].errors).toEqual([
      '[품목코드] 품목코드을(를) 넣어 주세요.',
      '[수량] 수량을(를) 넣어 주세요.',
    ])
    expect(preview.rows[0].errors).toEqual(['행 전체 문제'])
    expect(preview.summary).toContain('2행 중 2행에 오류')
    expect(buildPreview(template, [rows[0]], []).summary).toBe('1행 모두 올바릅니다.')
  })
})

describe('양식 파일', () => {
  it('양식을 만들어 다시 읽으면 제목 줄(필수는 *)이 그대로, 안내 시트가 있다', async () => {
    const buffer = await buildTemplateXlsx({ ...template, guide: ['안내 첫 줄'] })
    const table = await readXlsxTable(buffer)
    expect(table).toEqual([['품목코드 *', '수량 *', '비고']])
    expect(mapRows(template, [...table, ['A1', '2']]).rows).toEqual([
      { rowNo: 2, values: { code: 'A1', qty: '2', memo: '' } },
    ])
    const { Workbook } = await import('exceljs')
    const workbook = new Workbook()
    await workbook.xlsx.load(buffer)
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['입력', '안내'])
  })
})
