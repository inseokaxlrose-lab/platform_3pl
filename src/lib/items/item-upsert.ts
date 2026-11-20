import 'server-only'
import type { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import type { Db } from '@/lib/prisma'
import { shipperDefaultsSelect, shipperItemDefaults } from '@/lib/shippers/shipper-defaults'
import type { ItemWarning } from './item-calc'
import type { ItemStatus } from './item-codes'
import { EMPTY_ITEM_INPUT, shipperItemStart } from './item-defaults'
import { ITEM_INPUT_INCLUDE, itemInputOf } from './item-queries'
import { itemCreateSchema, itemSchema, type ItemInput } from './item-schema'
import { createItemIn, updateItemIn, type ItemSaveOptions } from './items'

// 품목 upsert (docs/decisions/0083 ②) — 엑셀 업로드와 품목 API(③)가 같이 쓰는 서비스
// - 화주사 + 품목코드로 찾고, 있으면 저장된 값 위에, 없으면 새 품목 처음 값 위에 "보낸 칸만" 덮어쓴다
//   (어떻게 덮어쓸지는 부르는 쪽의 patch가 정한다 — 엑셀은 평면 칸, API는 단위 배열)
// - 정리한 값이 전과 같으면 UNCHANGED (수정하지 않아 버전·이력이 늘지 않는다)
// - 권한·데이터 범위(화주사)는 부르는 쪽에서 확인한다
// - 트랜잭션(db)을 받는다: 업로드 미리보기는 같은 처리를 해 보고 되돌린다

export type ItemUpsertAction = 'CREATED' | 'UPDATED' | 'UNCHANGED'

export type ItemUpsertResult = {
  action: ItemUpsertAction
  id: bigint
  code: string
  warnings: ItemWarning[]
}

export type ItemUpsertInput = {
  shipperId: bigint
  code: string
  // 지금 값(또는 새 품목 처음 값) → 보낸 칸을 덮어쓴 값
  patch: (current: ItemInput, context: { isNew: boolean }) => ItemInput
  // 상태를 보냈으면 (사용·사용중지·단종)
  status?: ItemStatus
}

// 입력 규칙 오류: 첫 문구 + 연동 오류코드 + 칸 위치 (업로드·API가 행·건별 오류로 보여 준다)
export class ItemInputError extends ActionError {
  constructor(
    message: string,
    apiCode: string,
    // 입력 규칙의 칸 경로 (예: 'units.1.convQty', 'expiryType')
    readonly path: string,
  ) {
    super('VALIDATION', message, apiCode)
  }
}

function validationError(error: z.ZodError): ItemInputError {
  const issue = error.issues[0]
  const params = (issue as { params?: { apiCode?: string } } | undefined)?.params
  const path = issue?.path.join('.') ?? ''
  const apiCode = params?.apiCode ?? (path === 'code' ? 'ITEM_CD_INVALID' : 'VALIDATION_FAILED')
  return new ItemInputError(issue?.message ?? '입력값을 확인해 주세요.', apiCode, path)
}

// 정리한 값 비교용 글자 (bigint 포함)
const stable = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? String(v) : v))

// 새 품목 처음 값: 빈 입력 + 운영사 기본 팔레트 + 화주사 기한·LOT·시리얼 복사 (화면과 같다)
async function newItemStart(db: Db, shipperId: bigint): Promise<ItemInput> {
  const shipper = await db.shipper.findUnique({
    where: { id: shipperId },
    select: {
      ...shipperDefaultsSelect,
      operator: { select: { ...shipperDefaultsSelect.operator.select, defaultPalletType: true } },
    },
  })
  if (!shipper) throw new ActionError('NOT_FOUND', '화주사를 찾을 수 없습니다.')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { code, ...empty } = EMPTY_ITEM_INPUT
  return {
    ...empty,
    palletTypeCode: shipper.operator.defaultPalletType,
    ...shipperItemStart(shipperItemDefaults(shipper)),
  }
}

export async function upsertItem(
  db: Db,
  input: ItemUpsertInput,
  options: ItemSaveOptions = {},
): Promise<ItemUpsertResult> {
  const found = await db.item.findFirst({
    where: { shipperId: input.shipperId, code: input.code },
    include: ITEM_INPUT_INCLUDE,
  })

  // 새 품목
  if (!found) {
    const next = input.patch(await newItemStart(db, input.shipperId), { isNew: true })
    const parsed = itemCreateSchema.safeParse({
      ...next,
      shipperId: String(input.shipperId),
      code: input.code,
    })
    if (!parsed.success) throw validationError(parsed.error)
    const created = await createItemIn(db, parsed.data, options)
    if (input.status && input.status !== 'ACTIVE') {
      await db.item.update({ where: { id: created.id }, data: { status: input.status } })
    }
    return { action: 'CREATED', id: created.id, code: created.code, warnings: created.warnings }
  }

  // 이미 있는 품목: 보낸 칸만 덮어쓴 값이 지금과 같으면 그대로
  const current = itemInputOf(found)
  const next = input.patch(current, { isNew: false })
  const parsed = itemSchema.safeParse(next)
  if (!parsed.success) throw validationError(parsed.error)
  const before = itemSchema.safeParse(current)
  const statusChanged = input.status !== undefined && input.status !== found.status
  const dataChanged = !before.success || stable(before.data) !== stable(parsed.data)
  if (!dataChanged && !statusChanged) {
    return { action: 'UNCHANGED', id: found.id, code: found.code, warnings: [] }
  }
  let warnings: ItemWarning[] = []
  if (dataChanged) {
    warnings = (await updateItemIn(db, found.id, found.rowVersion, parsed.data, options)).warnings
  }
  if (statusChanged) {
    await db.item.update({ where: { id: found.id }, data: { status: input.status } })
  }
  return { action: 'UPDATED', id: found.id, code: found.code, warnings }
}
