'use client'

import { PlusIcon, StarIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { ACTIVE_STATUS, ConfirmDialog, StatusBadge } from '@/components/common'
import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import {
  deletePalletTypeAction,
  listPalletTypesAction,
  setDefaultPalletTypeAction,
} from './actions'

export const PALLET_LIST_HREF = '/admin/master/pallet-types'

type Row = {
  id: string
  code: string
  name: string
  widthCm: string
  depthCm: string
  heightCm: string
  weightKg: string
  maxLoadHeightCm: string | null
  maxLoadWeightKg: string | null
  source: string
  status: string
  isDefault: boolean
  updatedAt: Date
}

const SOURCE_BADGE: StatusFormat = {
  SYSTEM: { label: '시스템 기본', tone: 'neutral' },
  OPERATOR: { label: '운영사 추가', tone: 'info' },
  OVERRIDE: { label: '운영사 값으로 덮어씀', tone: 'warning' },
}

// 숫자 글자 정리: '110.00' → '110'
const num = (value: string | null) => (value === null ? '-' : String(Number(value)))

const SEARCH_FIELDS: SearchFieldDef[] = [
  { key: 'keyword', label: '검색어', type: 'keyword', span: 4, placeholder: '코드·이름' },
  {
    key: 'status',
    label: '상태',
    type: 'segment',
    options: [
      { value: 'ACTIVE', label: '사용' },
      { value: 'INACTIVE', label: '사용 중지' },
    ],
  },
]

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '코드',
    accessor: 'code',
    hideable: false,
    pinned: true,
    href: (row) => `${PALLET_LIST_HREF}/${row.id}`,
  },
  { id: 'name', header: '이름', accessor: 'name' },
  {
    id: 'isDefault',
    header: '운영사 기본',
    accessor: 'isDefault',
    cell: (row) => (row.isDefault ? <StatusBadge tone="success">기본</StatusBadge> : ''),
  },
  {
    id: 'size',
    header: '규격 (가로×세로×높이 cm)',
    accessor: (row) => `${num(row.widthCm)} × ${num(row.depthCm)} × ${num(row.heightCm)}`,
  },
  { id: 'weightKg', header: '자체 중량(kg)', accessor: (row) => num(row.weightKg) },
  {
    id: 'maxLoadHeightCm',
    header: '권장 적재 높이(cm)',
    accessor: (row) => num(row.maxLoadHeightCm),
  },
  {
    id: 'maxLoadWeightKg',
    header: '최대 적재 중량(kg)',
    accessor: (row) => num(row.maxLoadWeightKg),
  },
  { id: 'source', header: '구분', accessor: 'source', format: { status: SOURCE_BADGE } },
  {
    id: 'status',
    header: '상태',
    accessor: (row) => String(row.status === 'ACTIVE'),
    format: { status: ACTIVE_STATUS },
  },
  {
    id: 'updatedAt',
    header: '수정일시',
    accessor: 'updatedAt',
    format: 'datetime',
    defaultHidden: true,
  },
]

// 팔레트 종류 (docs/decisions/0083): 품목 PLT 계산의 기준 (규격·자체 중량·권장 적재 높이·최대 중량)
// 시스템 기본(T11·T12)은 고칠 수 없고, 같은 코드로 등록하면 이 운영사 값으로 덮어쓴다
export function PalletTypesList({
  can,
}: {
  can: { create: boolean; update: boolean; delete: boolean }
}) {
  const list = useListQuery<Row>({
    gridId: 'master-pallet-types',
    fields: SEARCH_FIELDS,
    fetch: listPalletTypesAction,
  })

  return (
    <MasterListPage
      title="팔레트 종류"
      description="품목의 PLT(팔레트) 수량·높이·중량을 계산하는 기준입니다. 시스템 기본은 같은 코드로 등록해 이 운영사 값으로 덮어쓸 수 있습니다."
      actions={
        can.create && (
          <Button asChild>
            <Link href={`${PALLET_LIST_HREF}/new`}>
              <PlusIcon />
              팔레트 종류 등록
            </Link>
          </Button>
        )
      }
      gridId="master-pallet-types"
      searchFields={SEARCH_FIELDS}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={(row) => `${PALLET_LIST_HREF}/${row.id}`}
      bulkActions={
        can.update || can.delete
          ? ({ ids, done }) => {
              const selected = list.rows.filter((r) => ids.includes(r.id))
              const one = selected.length === 1 ? selected[0] : null
              return (
                <>
                  {can.update && (
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!one || one.isDefault || one.status !== 'ACTIVE'}
                        >
                          <StarIcon />
                          운영사 기본으로
                        </Button>
                      }
                      title={`${one?.code ?? ''}을(를) 운영사 기본 팔레트로 정할까요?`}
                      description="새 품목의 팔레트 적재 기본값이 됩니다. 이미 등록된 품목은 바뀌지 않습니다."
                      confirmLabel="기본으로"
                      onConfirm={async () => {
                        unwrap(await setDefaultPalletTypeAction({ code: one!.code }))
                        done()
                      }}
                    />
                  )}
                  {can.delete && (
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={!one || one.source === 'SYSTEM'}
                        >
                          <Trash2Icon />
                          {one?.source === 'OVERRIDE' ? '시스템 값으로 되돌리기' : '삭제'}
                        </Button>
                      }
                      title={
                        one?.source === 'OVERRIDE'
                          ? `${one.code}을(를) 시스템 기본 값으로 되돌릴까요?`
                          : `${one?.code ?? ''}을(를) 지울까요?`
                      }
                      description="이 팔레트를 쓰는 품목은 다음 계산부터 시스템 기본 값(되돌리기) 또는 계산 없음(삭제)이 됩니다."
                      confirmLabel={one?.source === 'OVERRIDE' ? '되돌리기' : '삭제'}
                      destructive
                      onConfirm={async () => {
                        unwrap(await deletePalletTypeAction({ id: one!.id }))
                        done()
                      }}
                    />
                  )}
                </>
              )
            }
          : undefined
      }
      emptyTitle="팔레트 종류가 없습니다"
    />
  )
}
