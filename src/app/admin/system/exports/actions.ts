'use server'

import { createAction } from '@/lib/actions/create-action'
import { reportSchema } from '@/lib/reports/report-schema'
import { buildReport } from '@/lib/reports/reports'

// 정산·보고용 자료 추출 (docs/decisions/0064) — 권한 system.exports.export, 데이터 범위 적용
export const buildReportAction = createAction({
  permission: 'system.exports.export',
  input: reportSchema,
  handler: async ({ input, scope }) => buildReport(input, scope),
})
