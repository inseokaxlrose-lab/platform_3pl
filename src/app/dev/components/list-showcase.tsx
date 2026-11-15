'use client'

import { ACTIVE_STATUS } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import {
  MasterListPage,
  useListQuery,
  type ListRequest,
  type SearchFieldDef,
} from '@/components/master-list'
import { Button } from '@/components/ui/button'

// 견본 행: 모든 셀 서식(cellType)을 한 번씩 쓴다
type DemoRow = {
  id: string
  code: string
  name: string
  bizNo: string
  phone: string
  duty: string
  isActive: boolean
  vip: boolean
  weight: number
  count: number
  memo: string
  createdAt: string
}

const ROWS: DemoRow[] = Array.from({ length: 57 }, (_, i) => ({
  id: `d${i + 1}`,
  code: `DEMO${String(i + 1).padStart(3, '0')}`,
  name: `견본 거래처 ${i + 1}`,
  bizNo: '1234567891',
  phone: i % 2 ? '021234567' : '01012345678',
  duty: ['INBOUND', 'OUTBOUND', 'SETTLEMENT'][i % 3],
  isActive: i % 4 !== 0,
  vip: i % 5 === 0,
  weight: 1234.5 + i,
  count: i * 37,
  memo: '아주 긴 메모는 칸 너비를 넘으면 말줄임으로 줄이고, 마우스를 올리면 전체 글자를 보여줍니다.',
  createdAt: new Date(Date.UTC(2026, 10, 1 + (i % 28))).toISOString(),
}))

// 가짜 서버: 실제 화면에서는 서버 액션이 같은 일을 DB에서 한다
async function fakeFetch(request: ListRequest) {
  await new Promise((resolve) => setTimeout(resolve, 300))
  const { filters, search } = request
  let rows = ROWS.filter(
    (r) =>
      (!search || r.code.includes(search.toUpperCase()) || r.name.includes(search)) &&
      (!filters.status || r.isActive === (filters.status === 'ACTIVE')) &&
      (!filters.duty || filters.duty.split(',').includes(r.duty)) &&
      (!filters.vip || r.vip === (filters.vip === 'Y')),
  )
  const sort = request.sorting[0]
  if (sort) {
    const key = sort.id as keyof DemoRow
    rows = [...rows].sort((a, b) => (a[key] > b[key] ? 1 : -1) * (sort.desc ? -1 : 1))
  }
  const page = request.exportAll
    ? rows
    : rows.slice(request.pageIndex * request.pageSize, (request.pageIndex + 1) * request.pageSize)
  return { ok: true as const, data: { rows: page, rowCount: rows.length } }
}

const FIELDS: SearchFieldDef[] = [
  { key: 'keyword', label: '검색어', type: 'keyword', placeholder: '코드·이름' },
  {
    key: 'status',
    label: '상태 (segment)',
    type: 'segment',
    options: [
      { value: 'ACTIVE', label: '사용' },
      { value: 'INACTIVE', label: '중지' },
    ],
  },
  { key: 'duty', label: '업무 (codeMulti)', type: 'codeMulti', codeGroup: 'CONTACT_ROLE' },
  { key: 'vip', label: '중요 (yn)', type: 'yn', detail: true },
  { key: 'bizNo', label: '사업자번호 (bizNo)', type: 'bizNo', detail: true },
  { key: 'phone', label: '전화 (phone)', type: 'phone', detail: true },
  { key: 'createdAt', label: '등록일 (dateRange)', type: 'dateRange', span: 6, detail: true },
  { key: 'count', label: '수량 (numberRange)', type: 'numberRange', span: 6, detail: true },
]

const COLUMNS: DataGridColumn<DemoRow>[] = [
  {
    id: 'code',
    header: '코드 (link·고정)',
    accessor: 'code',
    sortable: true,
    pinned: true,
    href: () => '#',
  },
  { id: 'name', header: '이름 (고정)', accessor: 'name', sortable: true, pinned: true },
  { id: 'bizNo', header: '사업자번호', accessor: 'bizNo', format: 'bizNo' },
  { id: 'phone', header: '전화', accessor: 'phone', format: 'phone' },
  { id: 'duty', header: '업무 (code)', accessor: 'duty', format: { code: 'CONTACT_ROLE' } },
  {
    id: 'isActive',
    header: '상태 (status)',
    accessor: (r) => String(r.isActive),
    format: { status: ACTIVE_STATUS },
  },
  { id: 'vip', header: '중요 (yn)', accessor: 'vip', format: 'yn' },
  {
    id: 'weight',
    header: '무게 (소수·단위)',
    accessor: 'weight',
    format: { number: { decimals: 2, unit: 'kg' } },
  },
  { id: 'count', header: '수량 (number)', accessor: 'count', format: 'number', sortable: true },
  { id: 'memo', header: '메모 (text 말줄임)', accessor: 'memo' },
  {
    id: 'createdAt',
    header: '등록일 (date)',
    accessor: 'createdAt',
    format: 'date',
    sortable: true,
  },
  {
    id: 'createdAtTime',
    header: '등록일시 (datetime, 기본 숨김)',
    accessor: 'createdAt',
    format: 'datetime',
    defaultHidden: true,
  },
]

// 목록 화면 틀 견본: 검색 조건 종류·셀 서식·고정 컬럼·일괄 처리·엑셀을 한 화면에서
export function ListShowcase() {
  const list = useListQuery<DemoRow>({
    gridId: 'dev-list-showcase',
    fields: FIELDS,
    fetch: fakeFetch,
  })
  return (
    <MasterListPage
      title="견본 목록"
      description="가짜 서버(57건, 0.3초 지연). 조건·페이지·정렬이 주소창에 들어갑니다."
      gridId="dev-list-showcase"
      searchFields={FIELDS}
      list={list}
      columns={COLUMNS}
      getRowId={(r) => r.id}
      bulkActions={({ ids, done }) => (
        <Button type="button" variant="outline" disabled={ids.length === 0} onClick={done}>
          선택 처리 ({ids.length})
        </Button>
      )}
      excelName="견본목록"
    />
  )
}
