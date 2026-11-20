import { afterAll, describe, expect, it } from 'vitest'
import {
  API_ITEM_RESULT_VALUES,
  API_KEY_EVENT_VALUES,
  BONDED_TYPE_VALUES,
  EXTERNAL_ENTITY_TYPE_VALUES,
  FAULT_PARTY_VALUES,
  NUMBERING_SEPARATOR_VALUES,
  PERMISSION_EFFECT_VALUES,
  REGION_LOAD_STATUS_VALUES,
  REGION_LOAD_TYPE_VALUES,
  RESOLVE_LEVEL_VALUES,
  USER_TYPE_VALUES,
} from '@/config/db-codes'
import {
  ALLOC_RULE,
  BILLING_BASIS,
  BIZ_ENTITY,
  OPERATOR_STATUS,
  OPERATOR_TYPE,
  PLAN,
  STOCK_STATUS,
  TAX_TYPE,
  TEMP_ZONE,
} from '@/config/operator-codes'
import { API_ENV, API_KEY_STATUS, API_LOG_RESULT, API_SCOPE } from '@/lib/api/api-codes'
import { CENTER_STATUS, CENTER_TYPE } from '@/lib/centers/center-status'
import {
  CENTER_ASSIGN_STATUS,
  CENTER_ASSIGN_TYPE,
  CENTER_CONFIRM_REASON,
  CUSTOMER_STATUS,
  DATA_SOURCE,
  ORDER_ADDR_MODE,
  SHIP_TO_STATUS,
  CUSTOMER_ROLE,
} from '@/lib/customers/customer-codes'
import {
  ASN_CHANNEL_LABELS,
  ASN_STATUS_LABELS,
  INBOUND_TYPE_LABELS,
  PUTAWAY_STATUS_LABELS,
} from '@/lib/inbound/asn-schema'
import {
  BARCODE_TYPE,
  EXPIRY_INPUT,
  EXPIRY_TYPE,
  ITEM_SOURCE,
  ITEM_STATUS,
  ITEM_TYPE,
  LOT_SOURCE,
  UNIT_LEVEL,
} from '@/lib/items/item-codes'
import {
  DATE_FORMAT,
  NUMBERING_SCOPE,
  NUMBERING_TARGET,
  PREFIX_SOURCE,
  RESET_CYCLE,
} from '@/lib/numbering/numbering-codes'
import { ROLE_AREAS } from '@/lib/permissions/role-schema'
import { prisma } from '@/lib/prisma'
import {
  ADDR_GRADE,
  REGION_ASSIGN_TYPE,
  REGION_CHANGE_TYPE,
  TEMP_ZONE_ALL,
} from '@/lib/regions/region-codes'
import {
  IF_METHOD,
  ORDER_NO_SCOPE,
  SHIP_TO_CENTER_POLICY,
  SHIPPER_CENTER_STATUS,
  SHIPPER_STATUS,
  SHORTAGE_POLICY,
} from '@/lib/shippers/shipper-codes'
import { IF_KEY_TYPES, LABEL_UNITS } from '@/lib/shippers/shipper-schema'
import { STATUS } from '@/lib/status'
import { ADJUST_STATUS_LABELS, ADJUST_TYPE_LABELS } from '@/lib/stock/adjust-schema'
import { TXN_TYPE_LABELS } from '@/lib/stock/history-list'
import { UNIT_TYPES } from '@/lib/units/unit-labels'
import { WAREHOUSE_STATUS, WAREHOUSE_TYPE } from '@/lib/warehouses/warehouse-codes'

// 값 목록 칸의 상수 ↔ DB 검사 조건(CHECK … IN …)이 같은지 (docs/decisions/0084 ④-2, 0030·0040)
// 프로그램이 값에 따라 동작을 바꾸는 값은 상수 + DB CHECK 두 곳에 둔다 — 한쪽만 바꾸면 여기서 실패한다
// 새 값 목록 칸을 만들면 아래 표에 "표.칼럼: 상수"를 더한다 (빠지면 "상수가 없는 검사 조건"으로 실패)

const sorted = (values: readonly string[]) => [...values].sort()

const STATUS_VALUES = Object.keys(STATUS)
const REGION_TEMP_ZONES = [TEMP_ZONE_ALL, ...TEMP_ZONE.values]

const VALUE_SETS: Record<string, readonly string[]> = {
  // 사용자·권한
  'tb_user.user_type_cd': USER_TYPE_VALUES,
  'tb_user.status_cd': STATUS_VALUES,
  'tb_perm_group.app_area_cd': ROLE_AREAS,
  'tb_user_perm_override.effect_cd': PERMISSION_EFFECT_VALUES,
  // 운영사
  'tb_operator.status_cd': OPERATOR_STATUS.values,
  'tb_operator.operator_type_cd': OPERATOR_TYPE.values,
  'tb_operator.biz_entity_cd': BIZ_ENTITY.values,
  'tb_operator.tax_type_cd': TAX_TYPE.values,
  'tb_operator.plan_cd': PLAN.values,
  'tb_operator.billing_basis_cd': BILLING_BASIS.values,
  'tb_operator.alloc_rule_cd': ALLOC_RULE.values,
  'tb_operator_temp_zone.temp_zone_cd': TEMP_ZONE.values,
  'tb_operator_unit.status_cd': STATUS_VALUES,
  // 센터·창고·로케이션
  'tb_center.status_cd': CENTER_STATUS.values,
  'tb_center.center_type_cd': CENTER_TYPE.values,
  'tb_center.alloc_rule_cd': ALLOC_RULE.values,
  'tb_center.bonded_type_cd': BONDED_TYPE_VALUES,
  'tb_center_temp_zone.temp_zone_cd': TEMP_ZONE.values,
  'tb_warehouse.status_cd': WAREHOUSE_STATUS.values,
  'tb_warehouse.warehouse_type_cd': WAREHOUSE_TYPE.values,
  'tb_warehouse.temp_zone_cd': TEMP_ZONE.values,
  'tb_warehouse.default_stock_status_cd': STOCK_STATUS.values,
  'tb_stock.stock_status_cd': STOCK_STATUS.values,
  'tb_stock_txn.stock_status_cd': STOCK_STATUS.values,
  'tb_location.status_cd': STATUS_VALUES,
  'tb_zone.status_cd': STATUS_VALUES,
  // 공통코드·단위·팔레트·외부 코드·체번
  'tb_code_group.status_cd': STATUS_VALUES,
  'tb_code_item.status_cd': STATUS_VALUES,
  'tb_code_item.fault_party_cd': FAULT_PARTY_VALUES,
  'tb_unit.status_cd': STATUS_VALUES,
  'tb_unit.unit_type_cd': UNIT_TYPES,
  'tb_pallet_type.status_cd': STATUS_VALUES,
  'tb_ext_code.entity_type_cd': EXTERNAL_ENTITY_TYPE_VALUES,
  'tb_numbering_rule.target_cd': NUMBERING_TARGET.values,
  'tb_numbering_rule.scope_cd': NUMBERING_SCOPE.values,
  'tb_numbering_rule.prefix_src_cd': PREFIX_SOURCE.values,
  'tb_numbering_rule.date_fmt_cd': DATE_FORMAT.values,
  'tb_numbering_rule.reset_cycle_cd': RESET_CYCLE.values,
  'tb_numbering_rule.separator': NUMBERING_SEPARATOR_VALUES,
  // 화주사
  'tb_shipper.status_cd': SHIPPER_STATUS.values,
  'tb_shipper.biz_entity_cd': BIZ_ENTITY.values,
  'tb_shipper.tax_type_cd': TAX_TYPE.values,
  'tb_shipper.alloc_rule_cd': ALLOC_RULE.values,
  'tb_shipper.shortage_policy_cd': SHORTAGE_POLICY.values,
  'tb_shipper.ship_to_center_policy_cd': SHIP_TO_CENTER_POLICY.values,
  'tb_shipper.order_no_unique_scope_cd': ORDER_NO_SCOPE.values,
  'tb_shipper.if_method_cd': IF_METHOD.values,
  'tb_shipper.if_key_type_cd': IF_KEY_TYPES,
  'tb_shipper.label_unit_cd': LABEL_UNITS,
  'tb_shipper_center.status_cd': SHIPPER_CENTER_STATUS.values,
  'tb_shipper_center.alloc_rule_cd': ALLOC_RULE.values,
  // 품목
  'tb_item.status_cd': ITEM_STATUS.values,
  'tb_item.item_type_cd': ITEM_TYPE.values,
  'tb_item.source_cd': ITEM_SOURCE.values,
  'tb_item.temp_zone_cd': TEMP_ZONE.values,
  'tb_item.alloc_rule_cd': ALLOC_RULE.values,
  'tb_item.expiry_type_cd': EXPIRY_TYPE.values,
  'tb_item.expiry_input_cd': EXPIRY_INPUT.values,
  'tb_item.lot_source_cd': LOT_SOURCE.values,
  'tb_item.label_unit_cd': LABEL_UNITS,
  'tb_item_unit.unit_level_cd': UNIT_LEVEL.values,
  'tb_item_barcode.barcode_type_cd': BARCODE_TYPE.values,
  // 거래처·납품처
  'tb_customer.status_cd': CUSTOMER_STATUS.values,
  'tb_customer.source_cd': DATA_SOURCE.values,
  'tb_customer.order_addr_mode_cd': ORDER_ADDR_MODE.values,
  'tb_customer.customer_role_cd': CUSTOMER_ROLE.values,
  'tb_ship_to.status_cd': SHIP_TO_STATUS.values,
  'tb_ship_to.source_cd': DATA_SOURCE.values,
  'tb_ship_to.center_assign_type_cd': CENTER_ASSIGN_TYPE.values,
  'tb_ship_to.center_assign_status_cd': CENTER_ASSIGN_STATUS.values,
  'tb_ship_to.center_confirm_reason_cd': CENTER_CONFIRM_REASON.values,
  'tb_ship_to.resolve_level_cd': RESOLVE_LEVEL_VALUES,
  // 주소 정제 등급 (자동 지정 기준은 F 제외 — F는 정제 실패라 기준이 될 수 없다)
  'tb_address_norm_cache.grade': ADDR_GRADE.values,
  'tb_customer.addr_grade': ADDR_GRADE.values,
  'tb_ship_to.addr_grade': ADDR_GRADE.values,
  'tb_operator.region_auto_grade': ADDR_GRADE.values.filter((grade) => grade !== 'F'),
  // 권역
  'tb_region_center_map.assign_type_cd': REGION_ASSIGN_TYPE.values,
  'tb_region_center_map.temp_zone_cd': REGION_TEMP_ZONES,
  'tb_region_change_batch.change_type_cd': REGION_CHANGE_TYPE.values,
  'tb_region_change_batch.temp_zone_cd': REGION_TEMP_ZONES,
  'tb_region_load_hist.load_type_cd': REGION_LOAD_TYPE_VALUES,
  'tb_region_load_hist.status_cd': REGION_LOAD_STATUS_VALUES,
  // 입고·라벨·재고
  'tb_asn.inbound_type_cd': Object.keys(INBOUND_TYPE_LABELS),
  'tb_asn.reg_channel_cd': Object.keys(ASN_CHANNEL_LABELS),
  'tb_asn.asn_status_cd': Object.keys(ASN_STATUS_LABELS),
  'tb_asn.putaway_status_cd': Object.keys(PUTAWAY_STATUS_LABELS),
  'tb_inbound_label.label_unit_cd': LABEL_UNITS,
  'tb_stock_txn.txn_type_cd': Object.keys(TXN_TYPE_LABELS),
  'tb_stock_adjust.adjust_type_cd': Object.keys(ADJUST_TYPE_LABELS),
  'tb_stock_adjust.adjust_status_cd': Object.keys(ADJUST_STATUS_LABELS),
  // 화주 연동 API
  'tb_api_client.status_cd': API_KEY_STATUS.values,
  'tb_api_client.env_cd': API_ENV.values,
  'tb_api_client_scope.scope_cd': API_SCOPE.values,
  'tb_api_client_event.event_cd': API_KEY_EVENT_VALUES,
  'tb_api_request_log.result_cd': API_LOG_RESULT.values,
  'tb_api_request_item.result_cd': API_ITEM_RESULT_VALUES,
}

// DB의 검사 조건에서 "칼럼 = ANY (ARRAY[…])" (= IN (…)) 를 모두 꺼낸다 (예/아니오 칸은 빼고)
async function dbValueSets() {
  const rows = await prisma.$queryRaw<{ tbl: string; def: string }[]>`
    SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE contype = 'c' AND conrelid::regclass::text LIKE 'tb\\_%'`
  const sets = new Map<string, string[]>()
  for (const { tbl, def } of rows) {
    for (const m of def.matchAll(/\(?(\w+)\)?(?:::\w+)?\s*=\s*ANY\s*\(\(?ARRAY\[([^\]]*)\]/g)) {
      const column = m[1]
      const values = [...m[2].matchAll(/'([^']*)'/g)].map((v) => v[1])
      // 예/아니오 칸 (Y/N — COALESCE(x_yn, 'N') 모양도 있어 값으로 거른다)
      if (column.endsWith('_yn') || sorted(values).join() === 'N,Y') continue
      // 같은 칸에 업무 규칙용 일부 목록(예: 시스템 창고는 INBOUND·OUTBOUND·RETURN만)이 따로 있으면 전체 목록(가장 긴 것)을 쓴다
      const key = `${tbl}.${column}`
      if ((sets.get(key)?.length ?? 0) < values.length) sets.set(key, values)
    }
  }
  return sets
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('값 목록 상수 ↔ DB 검사 조건', () => {
  it('모든 값 목록 검사 조건에 상수가 있고, 값이 같다', async () => {
    const db = await dbValueSets()
    // 상수가 없는 검사 조건 (새 칸을 만들고 위 표에 안 더한 경우)
    expect([...db.keys()].filter((key) => !(key in VALUE_SETS)).sort()).toEqual([])
    // DB에 없는 상수 (칼럼 이름이 바뀌었거나 검사 조건이 빠진 경우)
    expect(Object.keys(VALUE_SETS).filter((key) => !db.has(key))).toEqual([])
    // 값이 다른 칸
    const mismatched = Object.entries(VALUE_SETS)
      .filter(([key]) => db.has(key))
      .filter(([key, values]) => sorted(values).join() !== sorted(db.get(key)!).join())
      .map(([key, values]) => `${key}: 상수 [${sorted(values)}] ↔ DB [${sorted(db.get(key)!)}]`)
    expect(mismatched).toEqual([])
  })
})
