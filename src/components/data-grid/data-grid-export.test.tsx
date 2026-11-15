import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataGrid, type DataGridProps } from './data-grid'
import { downloadXlsx } from './export-xlsx'
import { createDataGridState } from './state'
import type { DataGridColumn } from './types'

// 실제로 파일을 만들지 않고, 넘겨받은 시트 내용만 기록한다
vi.mock('./export-xlsx', () => ({ downloadXlsx: vi.fn() }))
const download = vi.mocked(downloadXlsx)

type Row = { id: string; name: string; qty: string }

const columns: DataGridColumn<Row>[] = [
  { id: 'name', header: '품목명', accessor: 'name', hideable: false },
  { id: 'qty', header: '수량', accessor: 'qty', format: 'number' },
]

// 서버 기준 전체 30건 중 화면에는 1페이지(20건)만 있다
const ALL_ROWS: Row[] = Array.from({ length: 30 }, (_, i) => ({
  id: `r${i + 1}`,
  name: `품목${i + 1}`,
  qty: `${i + 1}000.5`,
}))

function Harness(props: Partial<DataGridProps<Row>>) {
  const [state, setState] = useState(createDataGridState())
  return (
    <DataGrid
      id="export-test"
      columns={columns}
      data={ALL_ROWS.slice(0, 20)}
      rowCount={30}
      state={state}
      onStateChange={setState}
      getRowId={(row) => row.id}
      enableRowSelection
      exportExcel={{ fileName: '재고', fetchRows: async () => ALL_ROWS }}
      {...props}
    />
  )
}

const exportButton = () => screen.getByRole('button', { name: /엑셀|내보내는 중/ })
const openExportMenu = () => fireEvent.keyDown(exportButton(), { key: 'Enter' })
// 마지막으로 내려받은 시트: [제목, ...행]
const lastSheet = () => {
  const sheet = download.mock.lastCall![0]
  return [sheet.header, ...sheet.rows]
}

beforeEach(() => {
  download.mockClear()
})

describe('DataGrid 내보내기', () => {
  it('exportExcel이 없으면 엑셀 버튼이 없다', () => {
    render(<Harness exportExcel={undefined} />)
    expect(screen.queryByRole('button', { name: /엑셀/ })).toBeNull()
  })

  it('"조건에 맞는 전체"는 현재 페이지가 아니라 fetchRows의 전체 행을 내보낸다', async () => {
    render(<Harness />)
    openExportMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /조건에 맞는 전체 \(30건\)/ }))

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    const sheet = lastSheet()
    expect(sheet).toHaveLength(31) // 제목 + 30행
    expect(sheet[0]).toEqual(['품목명', '수량'])
    // 숫자는 숫자 그대로 (엑셀에서 계산 가능)
    expect(sheet[30]).toEqual(['품목30', 30000.5])
    expect(download.mock.lastCall![1]).toMatch(/^재고_\d{8}_\d{4}\.xlsx$/)
  })

  it('선택한 행이 없으면 "선택 행만" 메뉴가 없다', () => {
    render(<Harness />)
    openExportMenu()
    expect(screen.queryByRole('menuitem', { name: /선택 행만/ })).toBeNull()
  })

  it('"선택 행만"은 선택한 행만 내보낸다', async () => {
    render(<Harness />)
    const checkboxes = screen.getAllByRole('checkbox', { name: '행 선택' })
    fireEvent.click(checkboxes[1]) // r2
    fireEvent.click(checkboxes[4]) // r5

    openExportMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /선택 행만 \(2건\)/ }))

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    expect(lastSheet()).toEqual([
      ['품목명', '수량'],
      ['품목2', 2000.5],
      ['품목5', 5000.5],
    ])
  })

  it('숨긴 컬럼은 내보내지 않는다', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /컬럼/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: '수량' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    openExportMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /조건에 맞는 전체/ }))

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    expect(lastSheet()[0]).toEqual(['품목명'])
    expect(lastSheet()[1]).toEqual(['품목1'])
  })

  it('내보내는 동안 버튼이 "내보내는 중"으로 바뀌고 비활성화된다', async () => {
    let finish: (rows: Row[]) => void = () => {}
    const fetchRows = () => new Promise<Row[]>((resolve) => (finish = resolve))
    render(<Harness exportExcel={{ fileName: '재고', fetchRows }} />)

    openExportMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /조건에 맞는 전체/ }))

    expect(exportButton().textContent).toContain('내보내는 중')
    expect(exportButton()).toHaveProperty('disabled', true)

    await act(async () => finish(ALL_ROWS))
    expect(exportButton().textContent).toContain('엑셀')
    expect(exportButton()).toHaveProperty('disabled', false)
  })

  it('실패하면 오류 문구를 보여주고 파일을 만들지 않는다', async () => {
    const fetchRows = () => Promise.reject(new Error('서버 오류'))
    render(<Harness exportExcel={{ fileName: '재고', fetchRows }} />)

    openExportMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /조건에 맞는 전체/ }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      '내보내기에 실패했습니다. 다시 시도해 주세요.',
    )
    expect(download).not.toHaveBeenCalled()
  })
})
