import type { CarrierType, InvoiceCheckRule } from '@/lib/carriers/carrier-codes'

// 운영사 기본 운송사 (docs/decisions/0094) — 운영사를 만들 때 그 운영사에 복사한다 (provisionOperator)
// 사용자 결정: 택배 5곳 + 자차·용차. 운영사는 운송사 화면에서 이름·송장 규칙을 고치거나 더한다
// 송장 자릿수·체크디지트는 흔히 쓰는 값이다 — 실제 계약서의 송장 규칙과 다르면 운영사가 고친다
// 이 목록을 바꾸면 기존 운영사에는 마이그레이션으로 따로 넣는다 (20261120150000_carriers)

export type DefaultCarrier = {
  code: string
  name: string
  carrierType: CarrierType
  invoiceDigits: number | null
  invoiceCheck: InvoiceCheckRule
}

export const DEFAULT_CARRIERS: readonly DefaultCarrier[] = [
  {
    code: 'CJ',
    name: 'CJ대한통운',
    carrierType: 'PARCEL',
    invoiceDigits: 12,
    invoiceCheck: 'MOD7',
  },
  {
    code: 'HANJIN',
    name: '한진택배',
    carrierType: 'PARCEL',
    invoiceDigits: 12,
    invoiceCheck: 'MOD7',
  },
  {
    code: 'LOTTE',
    name: '롯데택배',
    carrierType: 'PARCEL',
    invoiceDigits: 12,
    invoiceCheck: 'MOD7',
  },
  {
    code: 'EPOST',
    name: '우체국택배',
    carrierType: 'PARCEL',
    invoiceDigits: 13,
    invoiceCheck: 'NONE',
  },
  {
    code: 'LOGEN',
    name: '로젠택배',
    carrierType: 'PARCEL',
    invoiceDigits: 11,
    invoiceCheck: 'MOD7',
  },
  { code: 'OWN', name: '자차', carrierType: 'OWN', invoiceDigits: null, invoiceCheck: 'NONE' },
  {
    code: 'CHARTER',
    name: '용차',
    carrierType: 'CHARTER',
    invoiceDigits: null,
    invoiceCheck: 'NONE',
  },
]
