// 주소 글자 해석 (정제 ④·⑤단계, docs/address-normalization.md) — 순수 함수
// 지역 마스터(폐지 제외 법정동)로 이름 사전을 만들고, 주소를 앞에서부터 시도 → 시군구로 맞춘 뒤
// 남은 글자(괄호 안 참고항목 포함)에서 읍면동 → 리를 찾는다
//   법정동(읍면동·리)까지 맞으면 'BJD'(C 등급), 시군구까지만 맞으면 'SIGUNGU'(D 등급)

export type BjdIndexRow = {
  code: string
  sidoCode: string
  sidoName: string
  sigunguCode: string
  sigunguName: string // '수원시 권선구', 세종은 ''
  emdName: string | null
  riName: string | null
  level: number
}

type Sigungu = { code: string; name: string; sidoCode: string }

export type BjdIndex = {
  sidoByAlias: Map<string, string> // '서울'·'서울시'·'서울특별시' → '11'
  sigungus: Sigungu[] // 이름 있는 시군구 (구가 있는 시 포함, 예: 수원시 41110)
  namelessSigungu: Map<string, string> // 시군구 이름이 없는 시도(세종) → 시군구 코드
  emds: Map<string, Map<string, string>> // 시군구 코드 → 읍면동 이름 → 법정동코드
  ris: Map<string, Map<string, string>> // 읍면동 법정동코드 → 리 이름 → 법정동코드
}

export type TextParseResult =
  | { level: 'BJD'; sidoCode: string; sigunguCode: string; bjdCode: string }
  // 구가 있는 시만 맞으면(예: '수원시') sigunguCode는 시 코드, sigunguCodes에 그 아래 구 전부
  | { level: 'SIGUNGU'; sidoCode: string; sigunguCode: string; sigunguCodes: string[] }
  | { level: 'NONE' }

// 시도 줄임말·옛 이름 (정식 이름·'서울'·'서울시'처럼 끝말을 뺀 것은 자동)
// 2026 자료: 광주광역시·전라남도 → 전남광주통합특별시(12). 사람들은 옛 이름으로 쓰므로 받는다
// ('광주시'는 경기도 광주시와 겹쳐 넣지 않는다)
const SIDO_ALIASES: Record<string, string[]> = {
  충청북도: ['충북'],
  충청남도: ['충남'],
  전라남도: ['전남'],
  경상북도: ['경북'],
  경상남도: ['경남'],
  전북특별자치도: ['전북', '전라북도'],
  강원특별자치도: ['강원', '강원도'],
  제주특별자치도: ['제주', '제주도'],
  세종특별자치시: ['세종', '세종시'],
  전남광주통합특별시: ['전남', '전라남도', '광주', '광주광역시', '전남광주'],
}

const shortSido = (name: string) => name.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '')

const addTo = <K, V>(map: Map<K, Map<string, V>>, key: K, name: string, value: V) => {
  const byName = map.get(key) ?? new Map<string, V>()
  if (!byName.has(name)) byName.set(name, value)
  map.set(key, byName)
}

export function buildBjdIndex(rows: BjdIndexRow[]): BjdIndex {
  const index: BjdIndex = {
    sidoByAlias: new Map(),
    sigungus: [],
    namelessSigungu: new Map(),
    emds: new Map(),
    ris: new Map(),
  }
  for (const row of rows) {
    // 시도 이름은 모든 기록에서 (세종은 시도 단계 기록이 없다)
    if (row.sidoName && !index.sidoByAlias.has(row.sidoName)) {
      const short = shortSido(row.sidoName)
      for (const alias of [
        row.sidoName,
        short,
        `${short}시`,
        ...(SIDO_ALIASES[row.sidoName] ?? []),
      ]) {
        index.sidoByAlias.set(alias, row.sidoCode)
      }
    }
    if (row.level === 2) {
      if (row.sigunguName) {
        index.sigungus.push({
          code: row.sigunguCode,
          name: row.sigunguName,
          sidoCode: row.sidoCode,
        })
      } else {
        index.namelessSigungu.set(row.sidoCode, row.sigunguCode)
      }
    }
    if (row.level === 3 && row.emdName) addTo(index.emds, row.sigunguCode, row.emdName, row.code)
  }
  // 자동으로 만든 별칭이 시군구 이름과 같으면 뺀다 (예: '제주시'는 제주도가 아니라 제주시)
  const sigunguNames = new Set(index.sigungus.map((s) => s.name))
  for (const alias of [...index.sidoByAlias.keys()]) {
    if (sigunguNames.has(alias)) index.sidoByAlias.delete(alias)
  }
  for (const row of rows) {
    if (row.level !== 4 || !row.riName) continue
    const emdCode = `${row.code.slice(0, 8)}00`
    addTo(index.ris, emdCode, row.riName, row.code)
    // 읍면동 기록이 없는 리(주소DB 이름으로 덧붙인 것)도 읍면동 이름으로 찾게
    if (row.emdName) addTo(index.emds, row.sigunguCode, row.emdName, emdCode)
  }
  return index
}

// 행정동 이름 → 법정동 이름: '역삼1동' → '역삼동', '영주제1동' → '영주동'
const legalEmdName = (name: string) => name.replace(/제?\d+동$/, '동')

// 시군구 범위(구가 있는 시면 그 아래 구 전부)에서 남은 글자로 읍면동 → 리
function findBjd(index: BjdIndex, scopes: Sigungu[], tokens: string[]) {
  for (let j = 0; j < tokens.length; j++) {
    for (const name of new Set([tokens[j], legalEmdName(tokens[j])])) {
      const hits = scopes.flatMap((s) => {
        const code = index.emds.get(s.code)?.get(name)
        return code ? [{ sigungu: s, code }] : []
      })
      if (hits.length !== 1) continue
      const riCode = index.ris.get(hits[0].code)?.get(tokens[j + 1] ?? '')
      return { sigungu: hits[0].sigungu, bjdCode: riCode ?? hits[0].code }
    }
  }
  return null
}

const childrenOf = (index: BjdIndex, s: Sigungu) =>
  index.sigungus.filter((c) => c.sidoCode === s.sidoCode && c.name.startsWith(`${s.name} `))

// 시군구 코드 → 실제 우편번호가 붙는 시군구 코드들 (구가 있는 시면 그 아래 구 전부)
export function sigunguScope(index: BjdIndex, code: string) {
  const self = index.sigungus.find((s) => s.code === code)
  const children = self ? childrenOf(index, self) : []
  return children.length ? children.map((s) => s.code) : [code]
}

// 주소 글자 → 해석 결과
export function parseAddressText(index: BjdIndex, address: string): TextParseResult {
  const tokens = address
    .normalize('NFC')
    .replace(/[^가-힣0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return { level: 'NONE' }

  // 1) 시도 (없어도 된다)
  const aliasSido = index.sidoByAlias.get(tokens[0])
  const rest = aliasSido ? tokens.slice(1) : tokens

  // 2) 시군구 후보: '수원시 권선구'(두 단어) 또는 한 단어('권선구'처럼 구 이름만도)
  const pickSigungu = (sidoCode: string | undefined) => {
    const pool = index.sigungus.filter((s) => !sidoCode || s.sidoCode === sidoCode)
    const two = pool.filter((s) => s.name === rest.slice(0, 2).join(' '))
    if (two.length === 1) return { list: two, used: 2 }
    const one = rest[0] ?? ''
    const exact = pool.filter((s) => s.name === one)
    const list = exact.length ? exact : pool.filter((s) => s.name.split(' ').at(-1) === one)
    return { list, used: 1 }
  }
  let { list, used } = pickSigungu(aliasSido)
  // 시도 이름 아래에 없으면 전국에서 (옛 시도 이름 등)
  if (aliasSido && list.length === 0) ({ list, used } = pickSigungu(undefined))

  if (list.length === 0) {
    // 시군구 이름이 없는 시도(세종): 시도 다음 글자에서 바로 읍면동
    const nameless = aliasSido ? index.namelessSigungu.get(aliasSido) : undefined
    if (!nameless) return { level: 'NONE' }
    const scope = { code: nameless, name: '', sidoCode: aliasSido! }
    const found = findBjd(index, [scope], rest)
    return found
      ? { level: 'BJD', sidoCode: scope.sidoCode, sigunguCode: nameless, bjdCode: found.bjdCode }
      : {
          level: 'SIGUNGU',
          sidoCode: scope.sidoCode,
          sigunguCode: nameless,
          sigunguCodes: [nameless],
        }
  }

  const after = rest.slice(used)
  // 같은 이름 시군구가 여럿(중구·동구·고성군…)이면 읍면동으로 가린다
  if (list.length > 1) {
    const found = findBjd(
      index,
      list.flatMap((s) => [s, ...childrenOf(index, s)]),
      after,
    )
    if (!found) return { level: 'NONE' }
    return {
      level: 'BJD',
      sidoCode: found.sigungu.sidoCode,
      sigunguCode: found.sigungu.code,
      bjdCode: found.bjdCode,
    }
  }

  const sigungu = list[0]
  const children = childrenOf(index, sigungu)
  const found = findBjd(index, children.length ? children : [sigungu], after)
  if (found) {
    return {
      level: 'BJD',
      sidoCode: sigungu.sidoCode,
      sigunguCode: found.sigungu.code,
      bjdCode: found.bjdCode,
    }
  }
  return {
    level: 'SIGUNGU',
    sidoCode: sigungu.sidoCode,
    sigunguCode: sigungu.code,
    sigunguCodes: children.length ? children.map((s) => s.code) : [sigungu.code],
  }
}
