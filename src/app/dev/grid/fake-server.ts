import type { DataGridState } from '@/components/data-grid'
import { createFakeInventory, type FakeInventoryRow } from './fake-inventory'

// 쇼케이스용 가짜 서버: 실제 서버처럼 검색 → 정렬 → 페이지 자르기를 하고, 0.4초 늦게 답한다
const ALL_ROWS = createFakeInventory()
const DELAY_MS = 400

const SEARCH_FIELDS: (keyof FakeInventoryRow)[] = [
  'itemName',
  'itemCode',
  'location',
  'shipperName',
  'lotNo',
]

function compare(a: FakeInventoryRow, b: FakeInventoryRow, id: string) {
  const x = a[id as keyof FakeInventoryRow]
  const y = b[id as keyof FakeInventoryRow]
  if (x === y) return 0
  if (x === null) return 1 // 빈 값은 항상 뒤로
  if (y === null) return -1
  if (id === 'qty') return Number(x) - Number(y)
  return String(x).localeCompare(String(y), 'ko')
}

// 검색 → 정렬까지 적용한 전체 행
function filterAndSort(state: DataGridState) {
  const keyword = state.search.toLowerCase()
  let rows = keyword
    ? ALL_ROWS.filter((row) =>
        SEARCH_FIELDS.some((field) =>
          String(row[field] ?? '')
            .toLowerCase()
            .includes(keyword),
        ),
      )
    : ALL_ROWS

  if (state.sorting.length > 0) {
    rows = [...rows].sort((a, b) => {
      for (const sort of state.sorting) {
        const result = compare(a, b, sort.id)
        if (result !== 0) return sort.desc ? -result : result
      }
      return 0
    })
  }

  return rows
}

const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS))

// 현재 페이지 조회
export async function queryFakeInventory(state: DataGridState) {
  await wait()
  const rows = filterAndSort(state)
  const start = state.pageIndex * state.pageSize
  return { rows: rows.slice(start, start + state.pageSize), rowCount: rows.length }
}

// 내보내기용: 현재 조건에 맞는 전체 행 (페이지 자르기 없음)
export async function queryAllFakeInventory(state: DataGridState) {
  await wait()
  return filterAndSort(state)
}
