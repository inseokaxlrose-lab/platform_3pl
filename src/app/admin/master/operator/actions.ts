'use server'

import { createAction } from '@/lib/actions/create-action'
import { requireOperatorId } from '@/lib/actor'
import { saveOperator } from '@/lib/operator/operator'
import { clearCorpRegNo, operatorSelfObject } from '@/lib/operator/operator-schema'
import { rowVersionField } from '@/lib/row-version'

// 운영사 자기 화면 저장 (docs/decisions/0024, 0040)
// 운영사 정보는 센터·화주사 데이터의 위에 있어 센터·화주사 범위 제한이 없다 → 메뉴 권한으로 막고, 대상은 항상 내 운영사 (0039)
// 운영사코드·유형·상태는 플랫폼이 정한다 → 입력 규칙에 칸이 없어 보내도 버려진다
export const saveOperatorAction = createAction({
  permission: 'master.operator.update',
  // rowVersion: 화면이 불러온 버전 (동시 수정 막기)
  input: operatorSelfObject.extend({ rowVersion: rowVersionField }),
  handler: async ({ input: { rowVersion, ...data } }) =>
    saveOperator(requireOperatorId(), clearCorpRegNo(data), rowVersion),
})
