import type { UploadTemplate } from './upload'
import { cellText } from './upload'

// 엑셀 파일 읽기·양식 만들기 (화면에서만, exceljs는 커서 쓸 때만 불러온다)

// .xlsx 내용 → 첫 시트의 표 (칸 값은 모두 글자)
export async function readXlsxTable(data: ArrayBuffer): Promise<string[][]> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  await workbook.xlsx.load(data)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []
  const table: string[][] = []
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellText(cell.value)
    })
    table[rowNumber - 1] = Array.from(cells, (v) => v ?? '')
  })
  return Array.from(table, (row) => row ?? [])
}

// 양식 파일 내용: 시트 1 '입력' (제목 줄만, 필수는 '*'), 시트 2 '안내' (칸별 필수·예시·설명)
export async function buildTemplateXlsx(template: UploadTemplate): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  const input = workbook.addWorksheet('입력', { views: [{ state: 'frozen', ySplit: 1 }] })
  const header = input.addRow(
    template.columns.map((c) => (c.required ? `${c.header} *` : c.header)),
  )
  header.font = { bold: true }
  template.columns.forEach((column, index) => {
    const col = input.getColumn(index + 1)
    col.width = column.width ?? Math.max(10, column.header.length * 2 + 4)
    // 모든 칸을 글자 서식으로: 코드 앞의 0이 사라지지 않게 (예: 00123)
    col.numFmt = '@'
  })

  const guide = workbook.addWorksheet('안내')
  for (const line of template.guide ?? []) guide.addRow([line])
  if (template.guide?.length) guide.addRow([])
  guide.addRow(['칸', '필수', '예시', '설명']).font = { bold: true }
  for (const column of template.columns) {
    guide.addRow([
      column.header,
      column.required ? '필수' : '',
      column.example ?? '',
      column.note ?? '',
    ])
  }
  guide.columns = [{ width: 18 }, { width: 8 }, { width: 22 }, { width: 70 }]
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

// 양식 내려받기
export async function downloadTemplate(template: UploadTemplate) {
  const buffer = await buildTemplateXlsx(template)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${template.name}_양식.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
