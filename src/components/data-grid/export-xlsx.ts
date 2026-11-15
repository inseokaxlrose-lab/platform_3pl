import type { ExportSheet } from './export-rows'

// 시트 → .xlsx 파일 내려받기
// exceljs는 크기가 커서 버튼을 누를 때만 불러온다 (첫 화면 크기에 영향 없음)
// 1만 건이 넘는 큰 내보내기는 브라우저 대신 서버에서 파일을 만드는 방식으로 바꾼다 (docs/ui-guidelines.md)
export async function downloadXlsx(sheet: ExportSheet, fileName: string, sheetName = '목록') {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  const worksheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })

  worksheet.addRow(sheet.header).font = { bold: true }
  sheet.rows.forEach((row) => worksheet.addRow(row))

  // 칸 너비: 제목·값 중 가장 긴 글자에 맞춤 (한글은 두 칸으로 셈, 최대 50)
  const textWidth = (value: unknown) =>
    [...String(value ?? '')].reduce((sum, ch) => sum + (/[^\x00-\xff]/.test(ch) ? 2 : 1), 0)
  worksheet.columns.forEach((column, index) => {
    const widest = Math.max(
      textWidth(sheet.header[index]),
      ...sheet.rows.map((row) => textWidth(row[index])),
    )
    column.width = Math.min(50, Math.max(8, widest + 2))
    // 숫자 칸은 천 단위 쉼표 서식 (소수가 있으면 소수 둘째 자리까지)
    const numbers = sheet.rows.map((row) => row[index]).filter((v) => typeof v === 'number')
    if (numbers.length > 0) {
      column.numFmt = numbers.every((n) => Number.isInteger(n)) ? '#,##0' : '#,##0.00'
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
