'use client'

import { PlayIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { ACTIVE_STATUS, ConfirmDialog, StatusBadge } from '@/components/common'
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
import { UNIT_TYPE_LABELS, UNIT_TYPE_STATUS, UNIT_TYPES } from '@/lib/units/unit-labels'
import { decimalText } from '@/lib/units/unit-format'
import { bulkAvailability } from './unit-bulk'
import {
  deleteUnitsAction,
  listUnitsAction,
  restoreUnitsAction,
  setUnitsActiveAction,
} from './actions'

const LIST_HREF = '/admin/master/units'

type UnitRow = {
  id: string
  code: string
  name: string
  nameEn: string | null
  type: string
  decimals: number
  sortOrder: number
  isActive: boolean
  isSystem: boolean
  isBase: boolean
  baseCode: string | null
  baseFactor: string | null
  stdCode: string | null
  updatedAt: Date
}

const SEARCH_FIELDS: SearchFieldDef[] = [
  {
    key: 'keyword',
    label: '검색어',
    type: 'keyword',
    span: 4,
    placeholder: '단위코드·단위명·영문명',
  },
  {
    key: 'type',
    label: '단위 유형',
    type: 'multi',
    options: UNIT_TYPES.map((value) => ({ value, label: UNIT_TYPE_LABELS[value] })),
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
  {
    key: 'system',
    label: '시스템 기본 단위',
    type: 'yn',
    detail: true,
    ynLabels: ['기본 단위', '추가 단위'],
  },
]

const COLUMNS: DataGridColumn<UnitRow>[] = [
  {
    id: 'code',
    header: '단위코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    cell: (row) => (
      <span className="inline-flex items-center gap-1.5">
        <Link href={`${LIST_HREF}/${row.id}`} className="font-medium text-primary hover:underline">
          {row.code}
        </Link>
        {row.isSystem && <StatusBadge tone="neutral">기본</StatusBadge>}
      </span>
    ),
  },
  { id: 'name', header: '단위명', accessor: 'name', sortable: true },
  { id: 'nameEn', header: '영문명', accessor: (row) => row.nameEn ?? '' },
  {
    id: 'type',
    header: '단위 유형',
    accessor: 'type',
    sortable: true,
    format: { status: UNIT_TYPE_STATUS },
  },
  { id: 'decimals', header: '소수 자리수', accessor: 'decimals', format: 'number' },
  {
    id: 'baseCode',
    header: '기준단위',
    accessor: (row) => (row.isBase ? '기준' : (row.baseCode ?? '')),
  },
  {
    id: 'baseFactor',
    header: '환산계수',
    align: 'right',
    accessor: (row) => (row.baseFactor && !row.isBase ? decimalText(row.baseFactor) : ''),
  },
  { id: 'stdCode', header: '표준코드', accessor: (row) => row.stdCode ?? '' },
  {
    id: 'isActive',
    header: '상태',
    accessor: (row) => String(row.isActive),
    sortable: true,
    format: { status: ACTIVE_STATUS },
  },
  {
    id: 'updatedAt',
    header: '수정일',
    accessor: 'updatedAt',
    format: 'date',
    sortable: true,
    defaultHidden: true,
  },
]

// 단위 목록 (docs/decisions/0034·0078): 시스템 기본 단위 + 운영사 추가 단위. 코드를 누르면 편집 화면
export function UnitsList({
  can,
  lockedCodes,
}: {
  can: { create: boolean; update: boolean; delete: boolean }
  lockedCodes: readonly string[]
}) {
  const list = useListQuery<UnitRow>({
    gridId: 'master-units',
    fields: SEARCH_FIELDS,
    fetch: listUnitsAction,
    // 건수가 적어 한 쪽에 다 보이게
    defaultPageSize: 100,
  })

  const bulk = (ids: string[], done: () => void, kind: 'deactivate' | 'activate' | 'delete') => {
    const blocked = bulkAvailability(
      list.rows.filter((r) => ids.includes(r.id)),
      lockedCodes,
    )[kind]
    const label = { deactivate: '사용 중지', activate: '다시 사용', delete: '삭제' }[kind]
    return (
      <ConfirmDialog
        key={kind}
        trigger={
          <Button
            type="button"
            variant={kind === 'activate' ? 'outline' : 'destructive'}
            disabled={blocked !== null}
            title={blocked ?? undefined}
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
            ? '운영사가 추가한 단위 중 어디에서도 쓰지 않는 단위만 지워집니다(시스템 기본 단위는 지울 수 없음). 쓰고 있으면 사용 중지하세요. 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.'
            : kind === 'deactivate'
              ? '새로 고르는 목록에서 빠집니다. 이미 쓰고 있는 데이터는 그대로 보입니다. 시스템 기본 단위는 이 운영사에서만 사용 중지되고, EA·BOX·PLT와 운영사 중량·길이 표시 단위는 사용 중지할 수 없습니다.'
              : '시스템 기본 단위는 이 운영사에서만 다시 사용합니다.'
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

  return (
    <MasterListPage
      title="단위"
      description="수량·포장·중량·부피·길이·면적 단위를 관리합니다. 시스템 기본 단위는 모든 운영사가 함께 쓰고, 필요한 단위만 추가합니다."
      actions={
        can.create && (
          <Button asChild>
            <Link href={`${LIST_HREF}/new`}>
              <PlusIcon />
              단위 추가
            </Link>
          </Button>
        )
      }
      gridId="master-units"
      searchFields={SEARCH_FIELDS}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
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
  )
}
