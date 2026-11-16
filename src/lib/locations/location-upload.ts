import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import {
  buildPreview,
  requiredIssues,
  type UploadIssue,
  type UploadPreview,
  type UploadRow,
} from '@/lib/excel/upload'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { isActiveStatus } from '@/lib/status'
import { locationCodeField, locationNameField, locationRemarkField } from './location-range'
import {
  locationUploadTemplate,
  UPLOAD_NUMBER_PATTERN,
  UPLOAD_ZONE_PATTERN,
} from './location-upload-template'

// 로케이션 엑셀 일괄 업로드 검증·등록 (docs/decisions/0071)
// 검증: 줄마다 문제를 모은다 (저장 안 함). 등록: 다시 검증하고, 문제가 없을 때만 한 번에 만든다
// 이미 있는 로케이션은 오류가 아니라 건너뛴다 ([일괄 생성]과 같다)

type PlannedLocation = {
  rowNo: number
  warehouseId: bigint
  code: string
  name: string
  remark: string | null
  zone: string | null
  aisle: string | null
  level: string | null
}

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message ?? '값을 확인해 주세요.'

export async function checkLocationUpload(
  rows: UploadRow[],
  scope: DataScope,
): Promise<{ issues: UploadIssue[]; planned: PlannedLocation[]; existing: number }> {
  const issues: UploadIssue[] = requiredIssues(locationUploadTemplate, rows)
  const add = (row: UploadRow, column: string, message: string) =>
    issues.push({ rowNo: row.rowNo, column, message })

  // 볼 수 있는 센터와 그 창고 (코드는 대소문자 구분 없이 찾는다)
  const centers = await prisma.center.findMany({
    where: scopeFilter(scope, { center: 'id' }),
    select: {
      id: true,
      code: true,
      warehouses: { select: { id: true, code: true, type: true, status: true } },
    },
  })
  const centerByCode = new Map(centers.map((c) => [c.code.toUpperCase(), c]))

  const planned: PlannedLocation[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const v = row.values
    if (!v.centerCode || !v.warehouseCode || !v.code) continue // 필수 칸 오류는 위에서

    const center = centerByCode.get(v.centerCode.trim().toUpperCase())
    if (!center) {
      add(row, 'centerCode', '없거나 볼 수 없는 센터입니다.')
      continue
    }
    const warehouse = center.warehouses.find(
      (w) => w.code.toUpperCase() === v.warehouseCode.trim().toUpperCase(),
    )
    if (!warehouse) {
      add(row, 'warehouseCode', '이 센터에 없는 창고입니다.')
      continue
    }
    if (warehouse.type === 'INBOUND_STAGING') {
      add(row, 'warehouseCode', '입고대기 창고에는 로케이션을 추가할 수 없습니다.')
      continue
    }
    if (!isActiveStatus(warehouse.status)) {
      add(row, 'warehouseCode', '사용 중지된 창고입니다.')
      continue
    }

    let ok = true
    const code = locationCodeField.safeParse(v.code)
    if (!code.success) {
      add(row, 'code', firstError(code))
      ok = false
    }
    const name = locationNameField.safeParse(v.name ?? '')
    if (!name.success) {
      add(row, 'name', firstError(name))
      ok = false
    }
    const remark = locationRemarkField.safeParse(v.remark ?? '')
    if (!remark.success) {
      add(row, 'remark', firstError(remark))
      ok = false
    }
    const zone = (v.zone ?? '').trim().toUpperCase()
    if (zone && !UPLOAD_ZONE_PATTERN.test(zone)) {
      add(row, 'zone', '구역은 영문 1~3자입니다.')
      ok = false
    }
    const aisle = (v.aisle ?? '').trim()
    if (aisle && !UPLOAD_NUMBER_PATTERN.test(aisle)) {
      add(row, 'aisle', '열은 숫자 1~3자리입니다.')
      ok = false
    }
    const level = (v.level ?? '').trim()
    if (level && !UPLOAD_NUMBER_PATTERN.test(level)) {
      add(row, 'level', '단은 숫자 1~3자리입니다.')
      ok = false
    }
    if (!ok || !code.success) continue

    // 같은 파일 안에서 같은 창고·같은 코드가 두 번
    const key = `${warehouse.id}:${code.data}`
    if (seen.has(key)) {
      add(row, 'code', '파일 안에 같은 창고·같은 코드가 이미 있습니다.')
      continue
    }
    seen.add(key)
    planned.push({
      rowNo: row.rowNo,
      warehouseId: warehouse.id,
      code: code.data,
      name: name.data || code.data,
      remark: remark.data || null,
      zone: zone || null,
      aisle: aisle || null,
      level: level || null,
    })
  }

  // 이미 있는 로케이션 (건너뛸 것)
  const existingRows = planned.length
    ? await prisma.location.findMany({
        where: {
          OR: planned.map((p) => ({ warehouseId: p.warehouseId, code: p.code })),
        },
        select: { warehouseId: true, code: true },
      })
    : []
  const existingKeys = new Set(existingRows.map((l) => `${l.warehouseId}:${l.code}`))
  const toCreate = planned.filter((p) => !existingKeys.has(`${p.warehouseId}:${p.code}`))
  return { issues, planned: toCreate, existing: planned.length - toCreate.length }
}

// 미리보기
export async function previewLocationUpload(
  rows: UploadRow[],
  scope: DataScope,
): Promise<UploadPreview> {
  const { issues, planned, existing } = await checkLocationUpload(rows, scope)
  const preview = buildPreview(locationUploadTemplate, rows, issues)
  if (preview.errorCount === 0) {
    preview.summary = `${rows.length}행 모두 올바릅니다. 새로 ${planned.length}개를 만들고${existing > 0 ? `, 이미 있는 ${existing}개는 건너뜁니다` : ''}.`
  }
  return preview
}

// 등록: 다시 검증 → 문제가 하나라도 있으면 거부, 없으면 한 번에 만든다
export async function commitLocationUpload(rows: UploadRow[], scope: DataScope) {
  const { issues, planned, existing } = await checkLocationUpload(rows, scope)
  if (issues.length > 0) {
    throw new ActionError(
      'VALIDATION',
      '오류가 있는 행이 있어 등록하지 않았습니다. 미리보기에서 오류를 확인해 주세요.',
    )
  }
  const operatorId = requireOperatorId()
  const { count } = await prisma.location.createMany({
    data: planned.map(({ rowNo, ...location }) => {
      void rowNo
      return { ...location, operatorId }
    }),
    // 미리 거른 뒤에도 동시에 누가 만들었을 수 있어 한 번 더 건너뛴다
    skipDuplicates: true,
  })
  const skipped = existing + (planned.length - count)
  return {
    created: count,
    skipped,
    message: `로케이션 ${count}개를 만들었습니다${skipped > 0 ? ` (이미 있어 건너뜀 ${skipped}개)` : ''}.`,
  }
}
