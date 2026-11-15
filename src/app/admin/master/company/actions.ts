'use server'

import { createAction } from '@/lib/actions/create-action'
import { requireOperatorId } from '@/lib/actor'
import { saveOperator } from '@/lib/operator/operator'
import { operatorSchema } from '@/lib/operator/operator-schema'
import { rowVersionField } from '@/lib/row-version'

// 운영사 정보 저장 (docs/decisions/0024)
// 운영사 정보는 센터·화주사 데이터의 위에 있어 센터·화주사 범위 제한이 없다 → 메뉴 권한으로 막고, 대상은 항상 내 운영사 (0039)
export const saveOperatorAction = createAction({
  permission: 'master.company.update',
  // rowVersion: 화면이 불러온 버전 (동시 수정 막기)
  input: operatorSchema.extend({ rowVersion: rowVersionField }),
  handler: async ({ input: { rowVersion, ...data } }) =>
    saveOperator(requireOperatorId(), data, rowVersion),
})
