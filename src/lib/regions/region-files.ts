// 지역 마스터 원본 파일 해석 (docs/decisions/0076) — 순수 함수 (적재 스크립트·테스트 공용)
//
// 1) 법정동코드 파일: 공공데이터포털 '국토교통부_법정동코드' CSV 또는 code.go.kr '법정동코드 전체자료' txt
//    머리줄에 법정동코드·법정동명·폐지여부 열이 있다 (쉼표 또는 탭 구분, CP949 또는 UTF-8)
// 2) 주소DB 파일: juso.go.kr 주소DB(도로명주소 한글) 전체분, 시도별 txt, '|' 구분, 한 줄 = 주소(건물) 하나
//    쓰는 열(0부터): 1 법정동코드, 2~5 시도·시군구·읍면동·리 이름, 10 도로명, 12 건물본번, 16 기초구역번호(우편번호)
//    파일 모양이 다르면 첫 줄부터 검사해 어느 줄·열이 맞지 않는지 알려 준다

export type BjdRow = {
  code: string
  sidoCode: string
  sidoName: string
  sigunguCode: string
  sigunguName: string
  emdName: string | null
  riName: string | null
  level: 1 | 2 | 3 | 4
  abolished: boolean
}

// 법정동코드 → 단계: 시군구 000 → 시도, 읍면동 000 → 시군구, 리 00 → 읍면동, 그 밖 → 리
export function bjdLevel(code: string): 1 | 2 | 3 | 4 {
  if (code.slice(2, 5) === '000') return 1
  if (code.slice(5, 8) === '000') return 2
  if (code.slice(8, 10) === '00') return 3
  return 4
}

// 한 줄 나누기 (따옴표로 감싼 칸은 벗긴다)
const split = (line: string, delimiter: string) =>
  line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, '$1'))

// 법정동코드 파일 전체 → 법정동 목록 (이름은 위 단계 기록에서 이어 받는다)
export function parseBjdFile(text: string): BjdRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new Error('법정동코드 파일이 비어 있습니다.')
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const header = split(lines[0].replace(/^\uFEFF/, ''), delimiter)
  const col = (name: string) => {
    const index = header.indexOf(name)
    if (index === -1) {
      throw new Error(
        `법정동코드 파일 머리줄에 '${name}' 열이 없습니다. (머리줄: ${header.join(', ')})`,
      )
    }
    return index
  }
  const [codeCol, nameCol, abolishedCol] = [col('법정동코드'), col('법정동명'), col('폐지여부')]

  const raw = lines.slice(1).map((line, i) => {
    const cells = split(line, delimiter)
    const code = cells[codeCol] ?? ''
    if (!/^\d{10}$/.test(code)) {
      throw new Error(
        `법정동코드 파일 ${i + 2}번째 줄: 법정동코드가 10자리 숫자가 아닙니다 (${code})`,
      )
    }
    return { code, name: (cells[nameCol] ?? '').trim(), abolished: cells[abolishedCol] === '폐지' }
  })
  // 같은 코드가 존재·폐지로 두 번 있으면 존재를 쓴다
  const byCode = new Map<string, (typeof raw)[number]>()
  for (const row of raw) {
    const prev = byCode.get(row.code)
    if (!prev || (prev.abolished && !row.abolished)) byCode.set(row.code, row)
  }

  const nameOf = (code: string) => byCode.get(code)?.name ?? ''
  return [...byCode.values()].map(({ code, name, abolished }) => {
    const level = bjdLevel(code)
    const sidoName = nameOf(`${code.slice(0, 2)}00000000`) || name.split(' ')[0]
    const sigunguFull = level >= 2 ? nameOf(`${code.slice(0, 5)}00000`) : ''
    // 시군구 이름 = 시군구 기록 이름에서 시도 이름을 뺀 것 (예: '수원시 권선구'), 세종처럼 같으면 비움
    const sigunguName = sigunguFull.startsWith(sidoName)
      ? sigunguFull.slice(sidoName.length).trim()
      : sigunguFull
    const emdFull = level >= 3 ? nameOf(`${code.slice(0, 8)}00`) : ''
    const last = (full: string) => full.split(' ').at(-1) ?? ''
    return {
      code,
      sidoCode: code.slice(0, 2),
      sidoName,
      sigunguCode: code.slice(0, 5),
      sigunguName,
      emdName: level >= 3 ? last(emdFull) || last(name) : null,
      riName: level === 4 ? last(name) : null,
      level,
      abolished,
    }
  })
}

// 주소DB 한 줄에서 쓰는 칸
export type AddressRow = {
  bjdCode: string
  sidoName: string
  sigunguName: string
  emdName: string
  riName: string
  roadName: string
  buildingMain: number
  zipCode: string
}

export const ADDRESS_COLUMNS = {
  bjdCode: 1,
  sidoName: 2,
  sigunguName: 3,
  emdName: 4,
  riName: 5,
  roadName: 10,
  buildingMain: 12,
  zipCode: 16,
} as const

// 주소DB 한 줄 해석 (빈 줄은 null). 모양이 다르면 줄 번호와 함께 오류
export function parseAddressLine(line: string, lineNo: number): AddressRow | null {
  if (line.trim() === '') return null
  const cells = line.split('|')
  const bjdCode = cells[ADDRESS_COLUMNS.bjdCode]?.trim() ?? ''
  const zipCode = cells[ADDRESS_COLUMNS.zipCode]?.trim() ?? ''
  if (!/^\d{10}$/.test(bjdCode) || !/^\d{5}$/.test(zipCode)) {
    throw new Error(
      `주소DB ${lineNo}번째 줄: 열 모양이 예상과 다릅니다 (법정동코드 [${ADDRESS_COLUMNS.bjdCode}]번째 칸 '${bjdCode}', 기초구역번호 [${ADDRESS_COLUMNS.zipCode}]번째 칸 '${zipCode}'). 주소DB(도로명주소 한글) 전체분 파일인지 확인해 주세요.`,
    )
  }
  const cell = (index: number) => cells[index]?.trim() ?? ''
  return {
    bjdCode,
    sidoName: cell(ADDRESS_COLUMNS.sidoName),
    sigunguName: cell(ADDRESS_COLUMNS.sigunguName),
    emdName: cell(ADDRESS_COLUMNS.emdName),
    riName: cell(ADDRESS_COLUMNS.riName),
    roadName: cell(ADDRESS_COLUMNS.roadName),
    buildingMain: Number(cells[ADDRESS_COLUMNS.buildingMain] ?? 0) || 0,
    zipCode,
  }
}

// 법정동코드 파일에 없는 법정동을 주소DB 줄의 이름으로 만든다
// (두 파일의 기준일이 달라 새 코드가 아직 법정동 파일에 없을 때 — 예: 면 → 읍 승격으로 코드가 바뀜)
export function bjdFromAddress(row: AddressRow): BjdRow {
  const level = bjdLevel(row.bjdCode)
  return {
    code: row.bjdCode,
    sidoCode: row.bjdCode.slice(0, 2),
    sidoName: row.sidoName,
    sigunguCode: row.bjdCode.slice(0, 5),
    sigunguName: level >= 2 ? row.sigunguName : '',
    emdName: level >= 3 ? row.emdName || null : null,
    riName: level === 4 ? row.riName || null : null,
    level,
    abolished: false,
  }
}

// 법정동 표시 이름 (예: '대구광역시 달성군 구지읍 창리')
export const bjdFullName = (bjd: BjdRow) =>
  [bjd.sidoName, bjd.sigunguName, bjd.emdName, bjd.riName].filter(Boolean).join(' ')

// 주소 줄을 우편번호별로 모으기: 시군구, 주소 수, 법정동별 주소 수, 도로별 건물번호 범위
export type ZipSummary = {
  zipCode: string
  sidoCode: string
  sigunguCode: string
  addressCount: number
  bjdCounts: Map<string, number>
  roads: Map<string, { count: number; min: number; max: number }>
}

export class ZipAggregator {
  readonly zips = new Map<string, ZipSummary>()
  // 우편번호가 둘 이상의 시군구에 걸친 경우 (조사: 기초구역은 시군구 안에서 정해진다고 보고 확인용)
  readonly crossSigungu = new Set<string>()

  add(row: AddressRow) {
    let zip = this.zips.get(row.zipCode)
    if (!zip) {
      zip = {
        zipCode: row.zipCode,
        sidoCode: row.bjdCode.slice(0, 2),
        sigunguCode: row.bjdCode.slice(0, 5),
        addressCount: 0,
        bjdCounts: new Map(),
        roads: new Map(),
      }
      this.zips.set(row.zipCode, zip)
    } else if (zip.sigunguCode !== row.bjdCode.slice(0, 5)) {
      this.crossSigungu.add(row.zipCode)
    }
    zip.addressCount++
    zip.bjdCounts.set(row.bjdCode, (zip.bjdCounts.get(row.bjdCode) ?? 0) + 1)
    if (row.roadName) {
      const road = zip.roads.get(row.roadName)
      if (road) {
        road.count++
        road.min = Math.min(road.min, row.buildingMain)
        road.max = Math.max(road.max, row.buildingMain)
      } else {
        zip.roads.set(row.roadName, { count: 1, min: row.buildingMain, max: row.buildingMain })
      }
    }
  }
}

// 우편번호의 시군구 = 주소가 가장 많은 시군구 (경계에 몇 집만 걸친 우편번호가 처음 읽은 줄로 정해지지 않게)
// 조사(2026-09 주소DB): 시군구를 넘는 우편번호 117건 중 115건은 같은 시의 다른 구, 나머지도 대부분 1~2곳만 넘는다
export function mainSigunguCode(zip: ZipSummary) {
  const bySigungu = new Map<string, number>()
  for (const [bjdCode, count] of zip.bjdCounts) {
    const sigungu = bjdCode.slice(0, 5)
    bySigungu.set(sigungu, (bySigungu.get(sigungu) ?? 0) + count)
  }
  return [...bySigungu.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

// 대표 주소: 주소가 많은 도로 2곳 '권선로 300~420, 세권로 1~88' (200자 이내)
export function representativeAddress(zip: ZipSummary, max = 2) {
  const text = [...zip.roads.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], 'ko'))
    .slice(0, max)
    .map(([name, r]) => (r.min === r.max ? `${name} ${r.min}` : `${name} ${r.min}~${r.max}`))
    .join(', ')
  return text.slice(0, 200) || null
}

// 파일 글자 인코딩 판단: UTF-8로 읽어 깨진 글자(U+FFFD)가 있으면 CP949(EUC-KR)
export function decodeKorean(bytes: Uint8Array) {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('\uFFFD') ? new TextDecoder('euc-kr').decode(bytes) : utf8
}
