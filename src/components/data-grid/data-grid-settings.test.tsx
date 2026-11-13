import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DataGrid } from './data-grid'
import { GridSettingsContext, type GridSettingsStore } from './grid-settings-context'
import type { GridSettings } from './settings'
import type { DataGridColumn } from './types'
import { useDataGridState } from './use-data-grid-state'

type Row = { id: string; name: string; qty: number; status: string }

const columns: DataGridColumn<Row>[] = [
  { id: 'name', header: '품목명', accessor: 'name', sortable: true, hideable: false },
  { id: 'qty', header: '수량', accessor: 'qty', format: 'number', sortable: true },
  { id: 'status', header: '상태', accessor: 'status' },
]
const rows: Row[] = [{ id: 'r1', name: '사과', qty: 1000, status: '완료' }]

// 가짜 보관함: 저장·되돌리기 호출을 기록한다 (실제로는 서버 액션)
function fakeStore(saved?: GridSettings) {
  return {
    get: vi.fn(() => saved),
    save: vi.fn(),
    reset: vi.fn(),
  } satisfies GridSettingsStore
}

// 실제 목록 화면처럼: useDataGridState로 시작값을 받고 DataGrid에 넘긴다
function Screen() {
  const [state, setState] = useDataGridState('test-grid')
  return (
    <>
      <output data-testid="state">{`${state.pageSize}/${JSON.stringify(state.sorting)}`}</output>
      <DataGrid
        id="test-grid"
        columns={columns}
        data={rows}
        rowCount={rows.length}
        state={state}
        onStateChange={setState}
        getRowId={(row) => row.id}
      />
    </>
  )
}

function renderWith(store: GridSettingsStore) {
  return render(
    <GridSettingsContext value={store}>
      <Screen />
    </GridSettingsContext>,
  )
}

const headers = () =>
  screen
    .getAllByRole('columnheader')
    .map((th) => th.textContent)
    .filter(Boolean)
const gridState = () => screen.getByTestId('state').textContent

describe('DataGrid 사용자별 설정', () => {
  it('저장된 설정(순서·숨김·행 높이·건수·정렬)으로 시작하고, 시작만으로는 저장하지 않는다', () => {
    const store = fakeStore({
      columnOrder: ['status', 'name', 'qty'],
      hidden: ['qty'],
      density: 'comfortable',
      pageSize: 50,
      sorting: [{ id: 'name', desc: true }],
    })
    renderWith(store)

    expect(headers()).toEqual(['상태', '품목명'])
    expect(screen.getByRole('button', { name: '행 높이 촘촘하게' })).toBeTruthy()
    expect(gridState()).toBe('50/[{"id":"name","desc":true}]')
    expect(store.save).not.toHaveBeenCalled()
  })

  it('바꾸면 전체 설정을 저장한다', () => {
    const store = fakeStore()
    renderWith(store)

    fireEvent.click(screen.getByRole('button', { name: '행 높이 넓게' }))

    expect(store.save).toHaveBeenLastCalledWith('test-grid', {
      columnOrder: ['name', 'qty', 'status'],
      hidden: [],
      widths: {},
      density: 'comfortable',
      pageSize: 20,
      sorting: [],
    })

    fireEvent.click(screen.getByRole('button', { name: /수량/ }))
    expect(store.save).toHaveBeenLastCalledWith(
      'test-grid',
      expect.objectContaining({ sorting: [{ id: 'qty', desc: false }] }),
    )
  })

  it('기본값 되돌리기: 저장값을 지우고 처음 모습으로 돌아가며, 다시 저장하지 않는다', () => {
    const store = fakeStore({
      columnOrder: ['status', 'qty', 'name'],
      hidden: ['status'],
      density: 'comfortable',
      pageSize: 100,
      sorting: [{ id: 'qty', desc: true }],
    })
    renderWith(store)
    expect(headers()).toEqual(['수량', '품목명'])

    fireEvent.click(screen.getByRole('button', { name: /컬럼/ }))
    fireEvent.click(screen.getByRole('button', { name: '기본값 되돌리기' }))

    expect(store.reset).toHaveBeenCalledWith('test-grid')
    expect(headers()).toEqual(['품목명', '수량', '상태'])
    expect(screen.getByRole('button', { name: '행 높이 넓게' })).toBeTruthy()
    expect(gridState()).toBe('20/[]')
    expect(store.save).not.toHaveBeenCalled()
  })

  it('화면에서 없어진 컬럼의 저장값은 무시한다', () => {
    renderWith(fakeStore({ columnOrder: ['status', 'gone', 'qty'], hidden: ['gone', 'name'] }))
    // 저장 순서에서 gone은 버림 → status, qty
    // 저장 순서에 없던 name은 기본 순서의 맨 앞이라 맨 앞에, 숨김 금지라 보인다
    expect(headers()).toEqual(['품목명', '상태', '수량'])
  })
})
