// 관리 라벨 2D 코드에 담는 글자 (docs/decisions/0054, 0003 결정 6) — 화면·서버 공용, 순수 함수
// 모양: 형식 버전 | 라벨 번호 | 센터 | 화주사 | 품목 코드 | 로트 | 유통기한(YYYYMMDD) | 수량 | 단위
// 예: L1|LB261116-00001|ICN|GANA|WATER|L240101|20270131|1440|EA
// - 맨 앞 'L' + 버전: 나중에 항목이 늘면 L2로 올리고, 스캐너는 버전을 보고 읽는다
// - 칸 나눔은 '|'. 값 안의 '|'는 '/'로 바꿔 넣는다 (칸이 밀리지 않게), 빈 값은 빈 칸

export const LABEL_FORMAT_VERSION = 1

export type LabelPayloadFields = {
  labelNo: string
  centerCode: string
  shipperCode: string
  itemCode: string
  lotNo: string | null
  // 'YYYY-MM-DD' 또는 null
  expiryOn: string | null
  qty: string
  unit: string
}

const clean = (value: string | null) => (value ?? '').replaceAll('|', '/').trim()

export function buildLabelPayload(fields: LabelPayloadFields): string {
  return [
    `L${LABEL_FORMAT_VERSION}`,
    fields.labelNo,
    fields.centerCode,
    fields.shipperCode,
    fields.itemCode,
    fields.lotNo,
    fields.expiryOn ? fields.expiryOn.replaceAll('-', '') : '',
    fields.qty,
    fields.unit,
  ]
    .map(clean)
    .join('|')
}

// 스캐너 쪽 읽기 (형식 버전 1). 다른 모양이면 null
export function parseLabelPayload(text: string): (LabelPayloadFields & { version: number }) | null {
  const parts = text.split('|')
  const version = /^L(\d+)$/.exec(parts[0] ?? '')
  if (!version || Number(version[1]) !== 1 || parts.length !== 9) return null
  const [, labelNo, centerCode, shipperCode, itemCode, lotNo, expiry, qty, unit] = parts
  return {
    version: 1,
    labelNo,
    centerCode,
    shipperCode,
    itemCode,
    lotNo: lotNo || null,
    expiryOn: /^\d{8}$/.test(expiry)
      ? `${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6, 8)}`
      : null,
    qty,
    unit,
  }
}
