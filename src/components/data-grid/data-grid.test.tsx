import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DataGrid } from './data-grid'
import { createDataGridState } from './state'
import type { DataGridColumn, DataGridState } from './types'

type Row = { id: string; name: string; qty: string; status: string }

const columns: DataGridColumn<Row>[] = [
  { id: 'name', header: '품목명', accessor: 'name', sortable: true },
  { id: 'qty', header: '수량', accessor: 'qty', format: 'number', sortable: true },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    format: { status: { DONE: { label: '완료', tone: 'success' } } },
  },
]

const rows: Row[] = [
  { id: 'r1', name: '사과', qty: '1234.500', status: 'DONE' },
  { id: 'r2', name: '배', qty: '20', status: 'DONE' },
]

// 실제 화면처럼 상태를 들고 있는 감싸기 부품
function Harness({
  data = rows,
  rowCount = 45,
  initial = createDataGridState({ pageIndex: 1 }),
  onState = () => {},
  onSelectionChange,
}: {
  data?: Row[]
  rowCount?: number
  initial?: DataGridState
  onState?: (s: DataGridState) => void
  onSelectionChange?: (ids: string[]) => void
}) {
  const [state, setState] = useState(initial)
  return (
    <DataGrid
      id="test-grid"
      columns={columns}
      data={data}
      rowCount={rowCount}
      state={state}
      onStateChange={(next) => {
        setState(next)
        onState(next)
      }}
      getRowId={(row) => row.id}
      enableRowSelection
      onSelectionChange={onSelectionChange}
    />
  )
}

describe('DataGrid', () => {
  it('셀 서식을 적용해서 그린다 (숫자 쉼표, 상태 배지)', () => {
    render(<Harness />)
    expect(screen.getByText('1,234.5')).toBeTruthy()
    expect(screen.getAllByText('완료')).toHaveLength(2)
  })

  it('정렬 가능한 제목을 누르면 정렬이 바뀌고 1페이지로 돌아간다', () => {
    const onState = vi.fn()
    render(<Harness onState={onState} />)

    fireEvent.click(screen.getByRole('button', { name: /수량/ }))

    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ sorting: [{ id: 'qty', desc: false }], pageIndex: 0 }),
    )
  })

  it('총 건수와 페이지를 보여주고, 다음 페이지로 이동한다', () => {
    const onState = vi.fn()
    render(<Harness onState={onState} />) // 45건, 20개씩 → 3페이지, 현재 2페이지

    expect(screen.getByText('2 / 3 페이지')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ pageIndex: 2 }))
  })

  it('헤더 체크박스로 현재 페이지 행을 모두 선택한다', () => {
    const onSelectionChange = vi.fn()
    render(<Harness onSelectionChange={onSelectionChange} />)

    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }))

    expect(onSelectionChange).toHaveBeenLastCalledWith(['r1', 'r2'])
    expect(screen.getByText('2건 선택')).toBeTruthy()
  })

  it('화면이 다시 그려지기 전에 연달아 선택해도 선택이 사라지지 않는다', () => {
    const onSelectionChange = vi.fn()
    render(<Harness onSelectionChange={onSelectionChange} />)
    const [first, second] = screen.getAllByRole('checkbox', { name: '행 선택' })

    // 두 클릭을 한 번에 처리 (사이에 화면 다시 그리기 없음)
    act(() => {
      first.click()
      second.click()
    })

    expect(onSelectionChange).toHaveBeenLastCalledWith(['r1', 'r2'])
    expect(screen.getByText('2건 선택')).toBeTruthy()
  })

  it('데이터가 없으면 빈 상태를 보여준다', () => {
    render(<Harness data={[]} rowCount={0} />)
    expect(screen.getByText('조회된 데이터가 없습니다')).toBeTruthy()
  })

  it('검색 결과가 없으면 검색어를 넣어 안내한다', () => {
    render(<Harness data={[]} rowCount={0} initial={createDataGridState({ search: '없는품목' })} />)
    const message = screen.getByText('검색 결과가 없습니다')
    expect(within(message.parentElement!).getByText(/없는품목/)).toBeTruthy()
  })
})
