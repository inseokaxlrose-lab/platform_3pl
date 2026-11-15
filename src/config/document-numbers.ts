// 업무 문서 번호 설정 (docs/decisions/0047) — 화면·서버 공용
// 번호 = 접두어 + 등록일(한국 시간 YYMMDD) + '-' + 일련번호 5자리 (예: AS261116-00001)
// 일련번호는 종류별 DB 시퀀스라 날짜가 바뀌어도 이어진다 → 날짜와 상관없이 항상 하나 (하루 10만 건을 넘으면 자리가 늘어난다)

export const DOCUMENT_NUMBER_TYPES = {
  ASN: { prefix: 'AS', sequence: 'doc_no_asn_seq', label: 'ASN' },
  RECEIPT: { prefix: 'RC', sequence: 'doc_no_receipt_seq', label: '입고확정' },
} as const

export type DocumentNumberType = keyof typeof DOCUMENT_NUMBER_TYPES

// 한국 시간 날짜 YYMMDD
export function kstYymmdd(at: Date): string {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(2, 10).replaceAll('-', '')
}

// 번호 모양 만들기: ('ASN', 1, 2026-11-16) → 'AS261116-00001'
export function formatDocumentNumber(
  type: DocumentNumberType,
  sequence: number | bigint,
  at: Date,
) {
  const { prefix } = DOCUMENT_NUMBER_TYPES[type]
  return `${prefix}${kstYymmdd(at)}-${String(sequence).padStart(5, '0')}`
}
