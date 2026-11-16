'use client'

import { PlayIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import {
  DELETED_STATUS_OPTION,
  isDeletedView,
  MasterListPage,
  RestoreButton,
  type SearchFieldDef,
  useListQuery,
} from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { UNIT_KIND_LABELS, UNIT_KIND_STATUS, UNIT_KINDS } from '@/lib/units/unit-labels'
import {
  deleteUnitsAction,
  listUnitsAction,
  restoreUnitsAction,
  setUnitsActiveAction,
} from './actions'
import { UnitDialog, type UnitRow } from './unit-dialog'

const SEARCH_FIELDS: SearchFieldDef[] = [
  { key: 'keyword', label: '검색어', type: 'keyword', span: 4, placeholder: '코드·이름' },
  {
    key: 'kind',
    label: '종류',
    type: 'segment',
    options: UNIT_KINDS.map((value) => ({ value, label: UNIT_KIND_LABELS[value] })),
  },
  {
    key: 'status',
    label: '상태',
    type: 'segment',
    options: [
      { value: 'ACTIVE', label: '사용' },
      { value: 'INACTIVE', label: '사용 중지' },
      // 지운 단위 보기 → [되살리기]
      DELETED_STATUS_OPTION,
    ],
  },
]

const COLUMNS: DataGridColumn<UnitRow>[] = [
  {
    id: 'code',
    header: '코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    cell: (row) => (
      <span className="font-medium text-primary">
        {row.code}
        {row.isSystem && <span className="ml-1.5 text-xs text-muted-foreground">시스템</span>}
      </span>
    ),
  },
  { id: 'name', header: '이름', accessor: 'name', sortable: true },
  {
    id: 'kind',
    header: '종류',
    accessor: 'kind',
    sortable: true,
    format: { status: UNIT_KIND_STATUS },
  },
  {
    id: 'decimals',
    header: '소수 자리수',
    accessor: (row) => (row.kind === 'BASE' ? row.decimals : null),
    format: 'number',
  },
  { id: 'sortOrder', header: '정렬 순서', accessor: 'sortOrder', format: 'number', sortable: true },
  {
    id: 'isActive',
    header: '상태',
    accessor: (row) => String(row.isActive),
    sortable: true,
    format: { status: ACTIVE_STATUS },
  },
]

// 단위 목록 (docs/decisions/0034): 행을 누르면 수정 팝업, [단위 추가]로 등록 팝업
export function UnitsList({ can }: { can: { create: boolean; update: boolean; delete: boolean } }) {
  const list = useListQuery<UnitRow>({
    gridId: 'master-units',
    fields: SEARCH_FIELDS,
    fetch: listUnitsAction,
  })
  // 열린 팝업: 'new' = 등록, 단위 = 수정
  const [editing, setEditing] = useState<UnitRow | 'new' | null>(null)

  const bulk = (ids: string[], done: () => void, kind: 'deactivate' | 'activate' | 'delete') => {
    const label = { deactivate: '사용 중지', activate: '다시 사용', delete: '삭제' }[kind]
    return (
      <ConfirmDialog
        key={kind}
        trigger={
          <Button
            type="button"
            variant={kind === 'activate' ? 'outline' : 'destructive'}
            disabled={ids.length === 0}
          >
            {kind === 'delete' ? (
              <Trash2Icon />
            ) : kind === 'activate' ? (
              <PlayIcon />
            ) : (
              <PowerIcon />
            )}
            {label}
            {ids.length > 0 && ` (${ids.length})`}
          </Button>
        }
        title={`단위 ${ids.length}개를 ${label}할까요?`}
        description={
          kind === 'delete'
            ? '품목에서 쓰지 않는 단위만 지워집니다. 시스템 단위(EA·BOX·PLT)는 지울 수 없습니다. 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.'
            : kind === 'deactivate'
              ? '새로 고르는 목록에서 빠집니다. 시스템 단위는 사용 중지할 수 없습니다.'
              : undefined
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteUnitsAction({ ids }))
          else unwrap(await setUnitsActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  const maxSort = Math.max(0, ...list.rows.map((u) => u.sortOrder))
  return (
    <>
      <MasterListPage
        title="단위"
        description="품목의 기본단위(재고를 세는 단위)와 환산단위(BOX·PLT 같은 묶음)로 고를 단위를 관리합니다."
        actions={
          can.create && (
            <Button type="button" onClick={() => setEditing('new')}>
              <PlusIcon />
              단위 추가
            </Button>
          )
        }
        gridId="master-units"
        searchFields={SEARCH_FIELDS}
        list={list}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        // "삭제됨" 보기에서는 수정 팝업을 열지 않는다
        onRowClick={isDeletedView(list.values) ? undefined : (row) => setEditing(row)}
        bulkActions={
          // "삭제됨" 보기에서는 [되살리기]만 (삭제 권한)
          isDeletedView(list.values)
            ? can.delete
              ? ({ ids, done }) => (
                  <RestoreButton
                    ids={ids}
                    noun="단위"
                    restore={(restoreIds) => restoreUnitsAction({ ids: restoreIds })}
                    done={done}
                  />
                )
              : undefined
            : can.update || can.delete
              ? ({ ids, done }) => (
                  <>
                    {can.update && bulk(ids, done, 'deactivate')}
                    {can.update && bulk(ids, done, 'activate')}
                    {can.delete && bulk(ids, done, 'delete')}
                  </>
                )
              : undefined
        }
        emptyTitle="등록된 단위가 없습니다"
      />
      <UnitDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        unit={editing && editing !== 'new' ? editing : undefined}
        nextSortOrder={Math.ceil((maxSort + 1) / 10) * 10}
        readOnly={editing === 'new' ? !can.create : !can.update}
        onSaved={list.refresh}
      />
    </>
  )
}
