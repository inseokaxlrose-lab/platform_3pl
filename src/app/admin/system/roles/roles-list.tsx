'use client'

import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { listPermissionGroupsAction } from './actions'
import { AREA_LABELS, AREA_STATUS } from './area-labels'

type Row = {
  id: string
  name: string
  area: string
  description: string | null
  updatedAt: Date
  permissionCount: number
  userCount: number
}

// 검색 조건 (키는 서버 listPermissionGroupsAction의 filters와 같게)
const SEARCH_FIELDS: SearchFieldDef[] = [
  { key: 'keyword', label: '검색어', type: 'keyword', span: 4, placeholder: '이름·설명' },
  {
    key: 'area',
    label: '영역',
    type: 'segment',
    span: 4,
    options: [
      { value: 'ADMIN', label: AREA_LABELS.ADMIN },
      { value: 'PORTAL', label: AREA_LABELS.PORTAL },
    ],
  },
]

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'name',
    header: '이름',
    accessor: 'name',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `/admin/system/roles/${row.id}`,
  },
  { id: 'area', header: '영역', accessor: 'area', sortable: true, format: { status: AREA_STATUS } },
  { id: 'description', header: '설명', accessor: 'description' },
  { id: 'permissionCount', header: '권한 수', accessor: 'permissionCount', format: 'number' },
  { id: 'userCount', header: '사용자 수', accessor: 'userCount', format: 'number' },
  {
    id: 'updatedAt',
    header: '수정일시',
    accessor: 'updatedAt',
    format: 'datetime',
    sortable: true,
  },
]

// 권한그룹 목록 (docs/decisions/0017): 건수가 적어 일괄 처리·엑셀은 두지 않는다
export function RolesList({ actions }: { actions?: React.ReactNode }) {
  const list = useListQuery<Row>({
    gridId: 'system-roles',
    fields: SEARCH_FIELDS,
    fetch: listPermissionGroupsAction,
  })
  return (
    <MasterListPage
      title="권한그룹"
      description="메뉴·버튼 권한을 묶어 사용자에게 배정합니다."
      actions={actions}
      gridId="system-roles"
      searchFields={SEARCH_FIELDS}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/system/roles/${row.id}`}
      emptyTitle="등록된 권한그룹이 없습니다"
    />
  )
}
