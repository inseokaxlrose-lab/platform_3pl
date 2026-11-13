import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataGrid, type DataGridProps } from './data-grid'
import { createDataGridState } from './state'
import type { DataGridColumn, DataGridState } from './types'

type Row = { id: string; name: string; qty: string; status: string }

const columns: DataGridColumn<Row>[] = [
  { id: 'name', header: '품목명', accessor: 'name', sortable: true, hideable: false },
  { id: 'qty', header: '수량', accessor: 'qty', format: 'number', sortable: true },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    format: { status: { DONE: { label: '완료', tone: 'success' } } },
  },
]

// 45건짜리 가짜 목록: 페이지마다 다른 행을 돌려준다 (서버 흉내)
const ALL_ROWS: Row[] = Array.from({ length: 45 }, (_, i) => ({
  id: `r${i + 1}`,
  name: `품목${i + 1}`,
  qty: String((i + 1) * 1000),
  status: 'DONE',
}))
const pageOf = (state: DataGridState) =>
  ALL_ROWS.slice(state.pageIndex * state.pageSize, (state.pageIndex + 1) * state.pageSize)

type HarnessProps = Partial<Omit<DataGridProps<Row>, 'state' | 'onStateChange'>> & {
  initial?: DataGridState
  onState?: (state: DataGridState) => void
  // 상태에 따라 행을 고르는 함수 (기본: 45건 목록의 해당 페이지)
  rowsFor?: (state: DataGridState) => Row[]
  // 바깥(화면)에서 상태를 바꾸는 버튼을 보여줄지
  withResetButton?: boolean
}

// 실제 화면처럼 상태를 들고 있는 감싸기 부품
function Harness({
  initial = createDataGridState(),
  onState = () => {},
  rowsFor = pageOf,
  withResetButton = false,
  ...props
}: HarnessProps) {
  const [state, setState] = useState(initial)
  return (
    <>
      {withResetButton && (
        <button type="button" onClick={() => setState(createDataGridState())}>
          바깥 초기화
        </button>
      )}
      <DataGrid
        id="test-grid"
        columns={columns}
        data={rowsFor(state)}
        rowCount={45}
        getRowId={(row) => row.id}
        enableRowSelection
        {...props}
        state={state}
        onStateChange={(next) => {
          setState(next)
          onState(next)
        }}
      />
    </>
  )
}

const sortButton = (name: string) => screen.getByRole('button', { name: new RegExp(name) })
const headerCell = (name: string) => sortButton(name).closest('th')!
const pageText = () => screen.getByText(/\d+ \/ \d+ 페이지/).textContent
// Radix 드롭다운은 키보드(Enter)로 연다
const openMenu = (button: HTMLElement) => fireEvent.keyDown(button, { key: 'Enter' })

afterEach(() => {
  vi.useRealTimers()
})

describe('DataGrid 표시', () => {
  it('셀 서식을 적용한다: 숫자 쉼표·오른쪽 정렬, 상태 배지', () => {
    render(<Harness />)
    const qtyCell = screen.getByText('1,000').closest('td')!
    expect(qtyCell.className).toContain('text-right')
    expect(screen.getAllByText('완료').length).toBeGreaterThan(0)
  })

  it('직접 그리기(cell)가 서식보다 우선한다', () => {
    render(
      <Harness
        columns={[{ ...columns[0], cell: (row) => <strong>[{row.name}]</strong> }, columns[1]]}
      />,
    )
    expect(screen.getByText('[품목1]').tagName).toBe('STRONG')
  })

  it('지정한 빈 상태 문구를 보여준다', () => {
    render(<Harness rowsFor={() => []} rowCount={0} empty={{ title: '등록된 재고가 없습니다' }} />)
    expect(screen.getByText('등록된 재고가 없습니다')).toBeTruthy()
  })

  it('검색 결과가 없으면 검색어를 넣어 안내한다', () => {
    render(
      <Harness
        rowsFor={() => []}
        rowCount={0}
        initial={createDataGridState({ search: '없는품목' })}
      />,
    )
    const message = screen.getByText('검색 결과가 없습니다')
    expect(within(message.parentElement!).getByText(/없는품목/)).toBeTruthy()
  })
})

describe('DataGrid 로딩', () => {
  it('첫 로딩(데이터 없음)에는 뼈대 행을 보여준다', () => {
    const { container } = render(<Harness rowsFor={() => []} loading />)
    expect(container.querySelectorAll('[data-slot=skeleton]').length).toBeGreaterThan(0)
    expect(screen.queryByText('조회된 데이터가 없습니다')).toBeNull()
  })

  it('다시 불러오는 중에는 기존 행을 유지하고 흐리게 한다', () => {
    const { container } = render(<Harness loading />)
    expect(screen.getByText('품목1')).toBeTruthy()
    expect(container.querySelector('tbody')!.className).toContain('opacity-50')
  })
})

describe('DataGrid 정렬', () => {
  it('같은 제목을 누를 때마다 오름 → 내림 → 해제, 매번 1페이지로', () => {
    const onState = vi.fn()
    render(<Harness onState={onState} initial={createDataGridState({ pageIndex: 2 })} />)

    fireEvent.click(sortButton('수량'))
    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ sorting: [{ id: 'qty', desc: false }], pageIndex: 0 }),
    )
    expect(headerCell('수량').getAttribute('aria-sort')).toBe('ascending')

    fireEvent.click(sortButton('수량'))
    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ sorting: [{ id: 'qty', desc: true }] }),
    )
    expect(headerCell('수량').getAttribute('aria-sort')).toBe('descending')

    fireEvent.click(sortButton('수량'))
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ sorting: [] }))
    expect(headerCell('수량').getAttribute('aria-sort')).toBeNull()
  })

  it('정렬 불가 컬럼은 버튼이 아니다', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: '상태' })).toBeNull()
  })
})

describe('DataGrid 페이지', () => {
  it('첫 페이지에서는 첫/이전 버튼이, 마지막 페이지에서는 다음/마지막 버튼이 비활성화', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: '첫 페이지' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: '이전 페이지' })).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: '마지막 페이지' }))
    expect(pageText()).toBe('3 / 3 페이지')
    expect(screen.getByRole('button', { name: '다음 페이지' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: '마지막 페이지' })).toHaveProperty('disabled', true)
  })

  it('다음·이전·첫 페이지로 이동한다', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(pageText()).toBe('3 / 3 페이지')
    expect(screen.getByText('품목41')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }))
    expect(pageText()).toBe('2 / 3 페이지')

    fireEvent.click(screen.getByRole('button', { name: '첫 페이지' }))
    expect(pageText()).toBe('1 / 3 페이지')
  })

  it('전체 건수가 줄어 현재 페이지가 없어지면 마지막 페이지로 이동한다', () => {
    const onState = vi.fn()
    // 5페이지를 보던 중 데이터가 줄어 전체 45건(3페이지)이 된 상황
    render(<Harness onState={onState} initial={createDataGridState({ pageIndex: 4 })} />)

    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ pageIndex: 2 }))
    expect(pageText()).toBe('3 / 3 페이지')
  })

  it('데이터가 0건이 되면 1페이지로 돌아간다', () => {
    const onState = vi.fn()
    render(
      <Harness
        onState={onState}
        rowsFor={() => []}
        rowCount={0}
        initial={createDataGridState({ pageIndex: 3 })}
      />,
    )
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ pageIndex: 0 }))
  })

  it('로딩 중에는 페이지를 보정하지 않는다 (아직 새 건수를 모르므로)', () => {
    const onState = vi.fn()
    render(<Harness onState={onState} loading initial={createDataGridState({ pageIndex: 4 })} />)
    expect(onState).not.toHaveBeenCalled()
  })

  it('한 페이지 건수를 바꾸면 1페이지로 돌아간다', () => {
    const onState = vi.fn()
    render(<Harness onState={onState} initial={createDataGridState({ pageIndex: 2 })} />)

    fireEvent.keyDown(screen.getByRole('combobox', { name: '한 페이지 건수' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('option', { name: '50개씩' }))

    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageSize: 50, pageIndex: 0 }),
    )
    expect(pageText()).toBe('1 / 1 페이지')
  })
})

describe('DataGrid 검색', () => {
  it('입력을 멈추고 0.3초가 지나야 검색하고, 앞뒤 공백은 지운다', () => {
    vi.useFakeTimers()
    const onState = vi.fn()
    render(<Harness onState={onState} initial={createDataGridState({ pageIndex: 2 })} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  품목1 ' } })
    act(() => vi.advanceTimersByTime(299))
    expect(onState).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: '품목1', pageIndex: 0 }),
    )
  })

  it('계속 입력하는 동안에는 검색하지 않는다 (마지막 입력만 반영)', () => {
    vi.useFakeTimers()
    const onState = vi.fn()
    render(<Harness onState={onState} />)
    const input = screen.getByRole('searchbox')

    fireEvent.change(input, { target: { value: '품' } })
    act(() => vi.advanceTimersByTime(200))
    fireEvent.change(input, { target: { value: '품목' } })
    act(() => vi.advanceTimersByTime(200))
    expect(onState).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(100))
    expect(onState).toHaveBeenCalledTimes(1)
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ search: '품목' }))
  })

  it('바깥에서 검색어를 초기화하면 입력칸도 비워진다', () => {
    render(<Harness withResetButton initial={createDataGridState({ search: '사과' })} />)
    expect(screen.getByRole('searchbox')).toHaveProperty('value', '사과')

    fireEvent.click(screen.getByRole('button', { name: '바깥 초기화' }))
    expect(screen.getByRole('searchbox')).toHaveProperty('value', '')
  })
})

describe('DataGrid 행 선택', () => {
  it('헤더 체크박스로 현재 페이지 행을 모두 선택한다', () => {
    const onSelectionChange = vi.fn()
    render(<Harness onSelectionChange={onSelectionChange} />)

    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }))

    expect(onSelectionChange.mock.lastCall![0]).toHaveLength(20)
    expect(screen.getByText('20건 선택')).toBeTruthy()
  })

  it('일부만 선택하면 헤더 체크박스가 "일부 선택" 상태가 된다', () => {
    render(<Harness />)
    fireEvent.click(screen.getAllByRole('checkbox', { name: '행 선택' })[0])
    expect(
      screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }).getAttribute('data-state'),
    ).toBe('indeterminate')
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

  it('페이지를 넘겨도 선택이 유지되고, 다른 페이지 선택이 더해진다', () => {
    const onSelectionChange = vi.fn()
    render(<Harness onSelectionChange={onSelectionChange} />)

    fireEvent.click(screen.getAllByRole('checkbox', { name: '행 선택' })[0]) // r1
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    fireEvent.click(screen.getAllByRole('checkbox', { name: '행 선택' })[0]) // r21

    expect(onSelectionChange).toHaveBeenLastCalledWith(['r1', 'r21'])
    expect(screen.getByText('2건 선택')).toBeTruthy()
  })

  it('[선택 해제]를 누르면 모든 선택이 풀린다', () => {
    const onSelectionChange = vi.fn()
    render(<Harness onSelectionChange={onSelectionChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }))

    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }))

    expect(onSelectionChange).toHaveBeenLastCalledWith([])
    expect(screen.queryByText(/건 선택/)).toBeNull()
  })
})

describe('DataGrid 컬럼 표시', () => {
  it('컬럼 메뉴에서 끄면 표에서 사라지고, 숨김 금지 컬럼은 메뉴에 없다', () => {
    render(<Harness />)
    openMenu(screen.getByRole('button', { name: /컬럼/ }))

    expect(screen.queryByRole('menuitemcheckbox', { name: '품목명' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '수량' }))

    expect(screen.queryByRole('button', { name: /수량/ })).toBeNull()
    expect(screen.queryByText('1,000')).toBeNull()
  })
})
