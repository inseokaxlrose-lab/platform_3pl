import { Workbook } from 'exceljs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadXlsx } from './export-xlsx'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('downloadXlsx', () => {
  it('제목 굵게·첫 줄 고정, 숫자는 숫자 칸으로 실제 .xlsx 파일을 만든다', async () => {
    let blob: Blob | null = null
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b
      return 'blob:test'
    })
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadXlsx(
      {
        header: ['센터 코드', '창고 수'],
        rows: [
          ['ICN', 3],
          ['GMH', null],
        ],
      },
      '센터_20261115_1405.xlsx',
    )

    expect(click).toHaveBeenCalled()
    // 만든 파일을 다시 읽어 내용 확인
    const workbook = new Workbook()
    await workbook.xlsx.load(await blob!.arrayBuffer())
    const sheet = workbook.worksheets[0]
    expect(sheet.getRow(1).values).toEqual([undefined, '센터 코드', '창고 수'])
    expect(sheet.getRow(1).font?.bold).toBe(true)
    expect(sheet.getCell('B2').value).toBe(3)
    expect(sheet.getCell('B3').value).toBeNull()
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(sheet.getColumn(2).numFmt).toBe('#,##0')
  })
})
