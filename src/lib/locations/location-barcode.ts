// 로케이션 스캔용 바코드 (docs/decisions/0084 ⑤, 정의서 system_code H3) — 화면·서버 공용 순수 함수
// 로케이션 코드는 창고 안에서만 유일하다 (같은 센터의 두 창고에 A-01-01이 있을 수 있다).
// 그래서 바코드는 "창고코드 + 구분자 + 로케이션코드" — 창고코드는 센터 안에서 유일하므로 센터 안에서 바코드 하나 = 로케이션 하나.
//   예: STORAGE1.A-01-02, INBOUND.DEFAULT
// 구분자 '.'은 창고코드([A-Z0-9_])·로케이션코드([A-Z0-9-]) 어디에도 쓸 수 없다 (입력 규칙·DB 검사 조건이 막는다)

export const LOCATION_BARCODE_SEPARATOR = '.'

// 라벨·화면 출력용 바코드 글자
export function buildLocationBarcode(warehouseCode: string, locationCode: string): string {
  return `${warehouseCode}${LOCATION_BARCODE_SEPARATOR}${locationCode}`
}

// 스캔한 글자 나누기: 구분자가 있으면 { warehouseCode, locationCode }, 없으면 로케이션코드만 (사람이 직접 친 경우)
// 대문자로 맞추고 앞뒤 공백은 뺀다. 구분자가 두 번 이상이거나 한쪽이 비면 null (바코드 모양이 아님)
export function splitLocationScan(
  scanned: string,
): { warehouseCode: string | null; locationCode: string } | null {
  const text = scanned.trim().toUpperCase()
  if (!text) return null
  const parts = text.split(LOCATION_BARCODE_SEPARATOR)
  if (parts.length === 1) return { warehouseCode: null, locationCode: parts[0] }
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { warehouseCode: parts[0], locationCode: parts[1] }
}
