'use server'

import { createAction } from '@/lib/actions/create-action'
import { saveCompany } from '@/lib/company/company'
import { companySchema } from '@/lib/company/company-schema'
import { rowVersionField } from '@/lib/row-version'

// 운영사 정보 저장 (docs/decisions/0024)
// 운영사 정보는 모든 센터·화주사 데이터의 위에 있어 데이터 범위 제한이 없다 → 메뉴 권한으로만 막는다
export const saveCompanyAction = createAction({
  permission: 'master.company.update',
  // rowVersion: 화면이 불러온 버전 (처음 등록이면 null, 동시 수정 막기)
  input: companySchema.extend({ rowVersion: rowVersionField.nullable() }),
  handler: async ({ input: { rowVersion, ...data } }) => saveCompany(data, rowVersion),
})
