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

export async function queryFakeInventory(state: DataGridState) {
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS))

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

  const start = state.pageIndex * state.pageSize
  return { rows: rows.slice(start, start + state.pageSize), rowCount: rows.length }
}
