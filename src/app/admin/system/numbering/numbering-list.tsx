'use client'

import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import { listNumberingRulesAction } from './actions'

export const NUMBERING_LIST_HREF = '/admin/system/numbering'

type Row = {
  id: string
  target: string
  targetLabel: string
  format: string
  preview: string
  previewNote: string
  scope: string
  resetCycle: string
  source: string
  issued: boolean
}

const SOURCE_BADGE: StatusFormat = {
  SYSTEM: { label: '시스템 기본', tone: 'neutral' },
  OPERATOR: { label: '운영사 규칙', tone: 'info' },
}

// 대상이 8개뿐이라 검색 조건은 두지 않는다
const SEARCH_FIELDS: SearchFieldDef[] = []

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'targetLabel',
    header: '대상',
    accessor: 'targetLabel',
    hideable: false,
    pinned: true,
    href: (row) => `${NUMBERING_LIST_HREF}/${row.target}`,
  },
  { id: 'format', header: '번호 모양', accessor: 'format' },
  {
    id: 'preview',
    header: '다음 번호',
    accessor: 'preview',
    cell: (row) => (
      <span>
        <span className="font-mono">{row.preview}</span>
        {row.previewNote && (
          <span className="ml-1.5 text-xs text-muted-foreground">({row.previewNote})</span>
        )}
      </span>
    ),
  },
  { id: 'scope', header: '번호 범위', accessor: 'scope' },
  { id: 'resetCycle', header: '초기화', accessor: 'resetCycle' },
  { id: 'source', header: '적용 규칙', accessor: 'source', format: { status: SOURCE_BADGE } },
  { id: 'issued', header: '발급한 번호', accessor: 'issued', format: 'yn' },
]

// 체번 규칙 (docs/decisions/0085): 기준정보 코드·업무 문서 번호를 자동으로 붙이는 모양
// 시스템 기본을 이 운영사 규칙으로 바꾸거나(모양 칸만) 기본으로 되돌린다
export function NumberingList() {
  const list = useListQuery<Row>({
    gridId: 'system-numbering',
    fields: SEARCH_FIELDS,
    fetch: listNumberingRulesAction,
  })
  return (
    <MasterListPage
      title="체번 규칙"
      description="코드를 비워 두고 등록하면 붙는 번호와 문서번호의 모양입니다. 대상을 누르면 이 운영사 규칙으로 바꿀 수 있습니다."
      gridId="system-numbering"
      searchFields={SEARCH_FIELDS}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={(row) => `${NUMBERING_LIST_HREF}/${row.target}`}
      emptyTitle="체번 규칙이 없습니다"
    />
  )
}
