'use client'

import { PencilIcon, PlusIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ACTIVE_STATUS, EmptyState, StatusBadge } from '@/components/common'
import { DataGrid, type DataGridColumn, useDataGridState } from '@/components/data-grid'
import { usePermission } from '@/components/permission'
import { Button } from '@/components/ui/button'
import {
  createCodeGroupAction,
  createCodeItemAction,
  deleteCodeGroupAction,
  deleteCodeItemAction,
  listCodeGroupsAction,
  listCodeItemsAction,
  updateCodeGroupAction,
  updateCodeItemAction,
} from './actions'
import { CodeEditDialog, EMPTY_CODE_FORM, type CodeFormValue } from './code-edit-dialog'

type GroupRow = {
  id: string
  code: string
  name: string
  description: string | null
  sortOrder: number
  isActive: boolean
  isSystem: boolean
  itemCount: number
}

type ItemRow = {
  id: string
  code: string
  name: string
  description: string | null
  sortOrder: number
  isActive: boolean
  updatedAt: Date
}

const statusColumn = {
  id: 'isActive',
  header: '상태',
  accessor: (row: { isActive: boolean }) => String(row.isActive),
  sortable: true,
  format: { status: ACTIVE_STATUS },
} as const

const groupColumns: DataGridColumn<GroupRow>[] = [
  {
    id: 'code',
    header: '그룹 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    cell: (row) => (
      <span className="font-medium">
        {row.code}
        {row.isSystem && (
          <StatusBadge tone="neutral" className="ml-1.5">
            시스템
          </StatusBadge>
        )}
      </span>
    ),
  },
  { id: 'name', header: '그룹명', accessor: 'name', sortable: true },
  { id: 'itemCount', header: '코드 수', accessor: 'itemCount', format: 'number' },
  statusColumn,
]

const itemColumns: DataGridColumn<ItemRow>[] = [
  { id: 'sortOrder', header: '순서', accessor: 'sortOrder', format: 'number', sortable: true },
  {
    id: 'code',
    header: '코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    cell: (row) => <span className="font-medium">{row.code}</span>,
  },
  { id: 'name', header: '코드명', accessor: 'name', sortable: true },
  { id: 'description', header: '설명', accessor: 'description' },
  statusColumn,
  { id: 'updatedAt', header: '수정일시', accessor: 'updatedAt', format: 'datetime' },
]

const toForm = (row: GroupRow | ItemRow): CodeFormValue => ({
  code: row.code,
  name: row.name,
  description: row.description ?? '',
  sortOrder: row.sortOrder,
  isActive: row.isActive,
})

type DialogState =
  | { kind: 'group'; mode: 'create'; initial: CodeFormValue }
  | { kind: 'group'; mode: 'edit'; initial: CodeFormValue; row: GroupRow }
  | { kind: 'item'; mode: 'create'; initial: CodeFormValue }
  | { kind: 'item'; mode: 'edit'; initial: CodeFormValue; row: ItemRow }

// 목록 조회 공통: 상태가 바뀌거나 version이 오르면 다시 읽는다 (늦게 온 이전 응답은 버린다)
function useList<T>(
  load: () => Promise<
    { ok: true; data: { rows: T[]; rowCount: number } } | { ok: false; error: { message: string } }
  >,
  deps: unknown[],
) {
  const [result, setResult] = useState<{ rows: T[]; rowCount: number }>({ rows: [], rowCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    load().then((response) => {
      if (cancelled) return
      if (response.ok) {
        setResult(response.data)
        setError(null)
      } else setError(response.error.message)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { result, loading, setLoading, error }
}

// 공통코드 관리 (docs/decisions/0030): 왼쪽 그룹 목록에서 행을 누르면 오른쪽에 그 그룹의 코드
export function CodesManager() {
  const router = useRouter()
  const { can } = usePermission()
  const [groupState, setGroupState] = useDataGridState('system-code-groups')
  const [itemState, setItemState] = useDataGridState('system-code-items')
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [dialog, setDialog] = useState<DialogState | null>(null)

  const groups = useList<GroupRow>(() => listCodeGroupsAction(groupState), [groupState, version])
  const items = useList<ItemRow>(
    () =>
      activeGroupId
        ? listCodeItemsAction({ ...itemState, groupId: activeGroupId })
        : Promise.resolve({ ok: true as const, data: { rows: [], rowCount: 0 } }),
    [itemState, activeGroupId, version],
  )
  const activeGroup = groups.result.rows.find((g) => g.id === activeGroupId) ?? null

  // 저장 후: 두 목록을 다시 읽고, 화면 틀이 나눠 주는 공통코드 목록(CodeSelect용)도 새로 읽는다
  function reload() {
    groups.setLoading(true)
    items.setLoading(true)
    setVersion((v) => v + 1)
    router.refresh()
  }

  const lockedNote =
    dialog?.kind === 'group' && dialog.mode === 'edit' && dialog.row.isSystem
      ? '시스템 그룹은 사용 중지·삭제할 수 없습니다.'
      : undefined

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section aria-label="코드 그룹" className="min-w-0 space-y-2">
        <h2 className="text-base font-semibold">코드 그룹</h2>
        {groups.error && (
          <p role="alert" className="text-sm text-destructive">
            {groups.error}
          </p>
        )}
        <DataGrid
          id="system-code-groups"
          columns={groupColumns}
          data={groups.result.rows}
          rowCount={groups.result.rowCount}
          state={groupState}
          onStateChange={(next) => {
            setGroupState(next)
            groups.setLoading(true)
          }}
          loading={groups.loading}
          getRowId={(row) => row.id}
          onRowClick={(row) => {
            if (row.id === activeGroupId) return
            setActiveGroupId(row.id)
            setItemState({ ...itemState, pageIndex: 0, search: '' })
            items.setLoading(true)
          }}
          activeRowId={activeGroupId ?? undefined}
          searchPlaceholder="그룹 코드·이름 검색"
          toolbarActions={
            <>
              {can('system.codes.update') && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!activeGroup}
                  onClick={() =>
                    activeGroup &&
                    setDialog({
                      kind: 'group',
                      mode: 'edit',
                      initial: toForm(activeGroup),
                      row: activeGroup,
                    })
                  }
                >
                  <PencilIcon />
                  그룹 수정
                </Button>
              )}
              {can('system.codes.create') && (
                <Button
                  type="button"
                  onClick={() =>
                    setDialog({ kind: 'group', mode: 'create', initial: EMPTY_CODE_FORM })
                  }
                >
                  <PlusIcon />
                  그룹 추가
                </Button>
              )}
            </>
          }
          empty={{ title: '등록된 코드 그룹이 없습니다' }}
        />
      </section>

      <section aria-label="코드" className="min-w-0 space-y-2">
        <h2 className="text-base font-semibold">
          코드
          {activeGroup && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {activeGroup.name} ({activeGroup.code})
            </span>
          )}
        </h2>
        {!activeGroup ? (
          <EmptyState
            title="왼쪽에서 코드 그룹을 고르세요"
            description="그룹을 누르면 그 그룹의 코드가 여기에 나옵니다."
          />
        ) : (
          <>
            {items.error && (
              <p role="alert" className="text-sm text-destructive">
                {items.error}
              </p>
            )}
            <DataGrid
              id="system-code-items"
              columns={itemColumns}
              data={items.result.rows}
              rowCount={items.result.rowCount}
              state={itemState}
              onStateChange={(next) => {
                setItemState(next)
                items.setLoading(true)
              }}
              loading={items.loading}
              getRowId={(row) => row.id}
              // 코드 행을 누르면 수정 팝업 (권한이 없으면 아무 일 없음)
              onRowClick={
                can('system.codes.update')
                  ? (row) => setDialog({ kind: 'item', mode: 'edit', initial: toForm(row), row })
                  : undefined
              }
              searchPlaceholder="코드·이름 검색"
              toolbarActions={
                can('system.codes.create') && (
                  <Button
                    type="button"
                    onClick={() =>
                      setDialog({
                        kind: 'item',
                        mode: 'create',
                        // 새 코드는 마지막 순서 뒤로 (10 단위)
                        initial: {
                          ...EMPTY_CODE_FORM,
                          sortOrder: (activeGroup.itemCount + 1) * 10,
                        },
                      })
                    }
                  >
                    <PlusIcon />
                    코드 추가
                  </Button>
                )
              }
              empty={{ title: '이 그룹에 등록된 코드가 없습니다' }}
            />
          </>
        )}
      </section>

      {dialog && (
        <CodeEditDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          mode={dialog.mode}
          title={
            dialog.kind === 'group'
              ? dialog.mode === 'create'
                ? '코드 그룹 추가'
                : '코드 그룹 수정'
              : dialog.mode === 'create'
                ? `코드 추가 — ${activeGroup?.name ?? ''}`
                : `코드 수정 — ${activeGroup?.name ?? ''}`
          }
          codeLabel={dialog.kind === 'group' ? '그룹 코드' : '코드'}
          codePlaceholder={dialog.kind === 'group' ? '예: CONTACT_DUTY' : '예: INBOUND'}
          initial={dialog.initial}
          lockedNote={lockedNote}
          onSave={async ({ code, ...rest }) => {
            if (dialog.kind === 'group') {
              return dialog.mode === 'create'
                ? createCodeGroupAction({ code, ...rest })
                : updateCodeGroupAction({ id: dialog.row.id, ...rest })
            }
            return dialog.mode === 'create'
              ? createCodeItemAction({ groupId: activeGroupId!, code, ...rest })
              : updateCodeItemAction({ id: dialog.row.id, ...rest })
          }}
          onDelete={
            dialog.mode === 'edit' && can('system.codes.delete')
              ? async () => {
                  if (dialog.kind === 'group') {
                    const result = await deleteCodeGroupAction({ id: dialog.row.id })
                    if (result.ok) setActiveGroupId(null)
                    return result
                  }
                  return deleteCodeItemAction({ id: dialog.row.id })
                }
              : undefined
          }
          deleteDescription={
            dialog.kind === 'group'
              ? '코드가 하나도 없는 그룹만 지울 수 있습니다. 되돌릴 수 없습니다.'
              : '업무 데이터에서 쓰지 않는 코드만 지울 수 있습니다. 쓰는 코드는 사용 중지하세요.'
          }
          onDone={reload}
        />
      )}
    </div>
  )
}
