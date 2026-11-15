'use client'

import { usePermission } from '@/components/permission'
import type { DataGridColumn } from '@/components/data-grid'
import {
  DELETED_STATUS_OPTION,
  isDeletedView,
  MasterListPage,
  RestoreButton,
  type SearchFieldDef,
  useListQuery,
} from '@/components/master-list'
import { listPermissionGroupsAction, restorePermissionGroupAction } from './actions'
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
  // 지운 권한그룹 보기 → [되살리기] (권한그룹은 사용/중지가 없어 "삭제됨"만)
  { key: 'status', label: '상태', type: 'segment', span: 4, options: [DELETED_STATUS_OPTION] },
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

// 권한그룹 목록 (docs/decisions/0017): 건수가 적어 일괄 처리·엑셀은 두지 않는다 ("삭제됨" 보기의 [되살리기]만)
export function RolesList({ actions }: { actions?: React.ReactNode }) {
  const { can } = usePermission()
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
      // "삭제됨" 보기: 수정 화면 대신 골라서 [되살리기] (삭제 권한)
      rowHref={isDeletedView(list.values) ? undefined : (row) => `/admin/system/roles/${row.id}`}
      bulkActions={
        isDeletedView(list.values) && can('system.roles.delete')
          ? ({ ids, done }) => (
              <RestoreButton
                ids={ids}
                noun="권한그룹"
                restore={async (restoreIds) => {
                  // 한 건씩 되살린다 (하나라도 실패하면 그 이유를 보여 준다)
                  for (const id of restoreIds) {
                    const result = await restorePermissionGroupAction({ id })
                    if (!result.ok) return result
                  }
                  return { ok: true, data: null }
                }}
                done={done}
              />
            )
          : undefined
      }
      emptyTitle="등록된 권한그룹이 없습니다"
    />
  )
}
