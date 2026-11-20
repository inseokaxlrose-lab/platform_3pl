'use client'

import { useMemo } from 'react'
import { StatusBadge, type StatusTone } from '@/components/common'
import { LocalDataGrid, type DataGridColumn } from '@/components/data-grid'
import type { LoginResult } from '@/config/db-codes'

// 사용자 수정 화면의 최근 로그인 이력 (0093): 최근 20건, 성공·실패·잠김·사용 중지
type LoginHistoryRow = {
  id: string
  result: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
}

// 결과 → 글자·색
const RESULT_LABELS: Record<LoginResult, { label: string; tone: StatusTone }> = {
  SUCCESS: { label: '성공', tone: 'success' },
  FAIL: { label: '비밀번호 틀림', tone: 'warning' },
  LOCKED: { label: '잠겨서 막힘', tone: 'danger' },
  DISABLED: { label: '사용 중지로 막힘', tone: 'neutral' },
}

export function LoginHistory({ rows }: { rows: LoginHistoryRow[] }) {
  const columns = useMemo<DataGridColumn<LoginHistoryRow>[]>(
    () => [
      { id: 'createdAt', header: '일시', accessor: 'createdAt', format: 'datetime', width: 150 },
      {
        id: 'result',
        header: '결과',
        accessor: 'result',
        width: 140,
        cell: (row) => {
          const found = RESULT_LABELS[row.result as LoginResult]
          return found ? <StatusBadge tone={found.tone}>{found.label}</StatusBadge> : row.result
        },
      },
      { id: 'ipAddress', header: '접속 IP', accessor: 'ipAddress', width: 140 },
      { id: 'userAgent', header: '브라우저', accessor: 'userAgent', width: 320 },
    ],
    [],
  )
  return (
    <LocalDataGrid
      id="user-login-history"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      empty={{ title: '로그인 기록이 없습니다.' }}
    />
  )
}
