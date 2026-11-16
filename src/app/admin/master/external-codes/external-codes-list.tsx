'use client'

import { useState } from 'react'
import { ACTIVE_STATUS } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import { EXTERNAL_SYSTEMS, EXTERNAL_SYSTEM_KEYS } from '@/config/external-systems'
import {
  EXTERNAL_TARGET_LABELS,
  EXTERNAL_TARGET_OWNER,
  EXTERNAL_TARGETS,
  parseExternalTarget,
} from '@/lib/master-code/external-code-targets'
import { listExternalCodesAction } from './actions'
import { ExternalCodeDialog, type ExternalCodeRow } from './external-code-dialog'

const [FIRST_TARGET, ...OTHER_TARGETS] = EXTERNAL_TARGETS

const SEARCH_FIELDS: SearchFieldDef[] = [
  {
    key: 'target',
    label: '대상',
    type: 'segment',
    // 빈 값 = 첫 대상(센터)
    allLabel: EXTERNAL_TARGET_LABELS[FIRST_TARGET],
    options: OTHER_TARGETS.map((value) => ({ value, label: EXTERNAL_TARGET_LABELS[value] })),
    span: 6,
  },
  { key: 'keyword', label: '검색어', type: 'keyword', span: 4, placeholder: '코드·이름' },
  {
    key: 'mapping',
    label: '매핑',
    type: 'segment',
    options: [
      { value: 'MAPPED', label: '있음' },
      { value: 'UNMAPPED', label: '없음' },
    ],
  },
  {
    key: 'status',
    label: '상태',
    type: 'segment',
    detail: true,
    options: [
      { value: 'ACTIVE', label: '사용' },
      { value: 'INACTIVE', label: '사용 중지' },
    ],
  },
]

// 대상 종류에 따라 "소속" 칸 이름이 바뀐다 (센터·화주사, 없으면 숨김)
function columnsFor(ownerLabel: string | undefined): DataGridColumn<ExternalCodeRow>[] {
  return [
    {
      id: 'code',
      header: '코드',
      accessor: 'code',
      sortable: true,
      hideable: false,
      pinned: true,
      cell: (row) => <span className="font-medium text-primary">{row.code}</span>,
    },
    { id: 'name', header: '이름', accessor: 'name', sortable: true },
    ...(ownerLabel
      ? [{ id: 'owner', header: ownerLabel, accessor: 'owner' } as DataGridColumn<ExternalCodeRow>]
      : []),
    ...EXTERNAL_SYSTEM_KEYS.map((system): DataGridColumn<ExternalCodeRow> => ({
      id: `ext-${system}`,
      header: `${EXTERNAL_SYSTEMS[system].label} 코드`,
      accessor: (row) => row.externalCodes[system] || null,
    })),
    {
      id: 'isActive',
      header: '상태',
      accessor: (row) => String(row.isActive),
      format: { status: ACTIVE_STATUS },
    },
  ]
}

// 외부코드 매핑 (docs/decisions/0068): 대상을 고르고, 줄을 누르면 수정 팝업
export function ExternalCodesList({ can }: { can: { update: boolean; export: boolean } }) {
  const list = useListQuery<ExternalCodeRow>({
    gridId: 'master-external-codes',
    fields: SEARCH_FIELDS,
    fetch: listExternalCodesAction,
  })
  const target = parseExternalTarget(list.values.target)
  const [editing, setEditing] = useState<ExternalCodeRow | null>(null)

  return (
    <>
      <MasterListPage
        title="외부코드 매핑"
        description="센터·품목 같은 기준정보를 SAP·ERP 등 바깥 시스템의 코드와 연결합니다. 대상은 각 기준정보 화면에서 만들고, 여기서는 연결 코드만 고칩니다."
        gridId="master-external-codes"
        searchFields={SEARCH_FIELDS}
        list={list}
        columns={columnsFor(EXTERNAL_TARGET_OWNER[target])}
        getRowId={(row) => row.id}
        onRowClick={(row) => setEditing(row)}
        excelName={can.export ? `외부코드_${EXTERNAL_TARGET_LABELS[target]}` : undefined}
        emptyTitle={`${EXTERNAL_TARGET_LABELS[target]}이(가) 없습니다`}
      />
      <ExternalCodeDialog
        target={target}
        row={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        readOnly={!can.update}
        onSaved={list.refresh}
      />
    </>
  )
}
