// DB 테이블 정의서 만들기: npm run db:doc
// 실제 DB 구조(칼럼·타입·키·검사 조건·인덱스)와 prisma/schema.prisma의 설명 주석을 합쳐
//   docs/db/DB_테이블정의서.xlsx (엑셀) · docs/db/table-definitions.md (문서)를 만든다
// 손으로 쓰지 않는다 — 마이그레이션을 적용한 뒤 이 명령을 다시 돌리면 정의서가 DB와 같아진다
import 'dotenv/config'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { prisma } from '../src/lib/prisma'
import { COMMON_COLUMNS, koreanName } from './db-doc-words'

const OUT_DIR = 'docs/db'
const XLSX = `${OUT_DIR}/DB_테이블정의서.xlsx`
const MD = `${OUT_DIR}/table-definitions.md`

// ── 1. schema.prisma 읽기: 모델 → 표 이름·설명, 필드 → 칼럼 이름·설명 ──

type FieldDoc = { field: string; column: string; comment: string; enumName?: string }
type ModelDoc = { model: string; table: string; comment: string; fields: Map<string, FieldDoc> }

function parseSchema(text: string) {
  const lines = text.split('\n')
  const models: ModelDoc[] = []
  const enums = new Map<string, string[]>()
  let pending: string[] = []
  let current: ModelDoc | null = null
  let currentEnum: { name: string; values: string[] } | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('//')) {
      const text = line
        .replace(/^\/\/+\s?/, '')
        .replace(/^──\s*/, '')
        .replace(/\s*──$/, '')
      // 앞줄이 이 줄의 앞부분과 같으면(같은 설명을 고쳐 쓴 흔적) 하나만 남긴다
      const last = pending[pending.length - 1]
      if (last && text.startsWith(last)) pending[pending.length - 1] = text
      else pending.push(text)
      continue
    }
    const modelStart = /^model (\w+) \{/.exec(line)
    if (modelStart) {
      current = {
        model: modelStart[1],
        table: modelStart[1],
        comment: pending.join(' '),
        fields: new Map(),
      }
      pending = []
      continue
    }
    const enumStart = /^enum (\w+) \{/.exec(line)
    if (enumStart) {
      currentEnum = { name: enumStart[1], values: [] }
      pending = []
      continue
    }
    if (line === '}') {
      if (current) models.push(current)
      if (currentEnum) enums.set(currentEnum.name, currentEnum.values)
      current = null
      currentEnum = null
      pending = []
      continue
    }
    if (currentEnum) {
      const value = /^(\w+)/.exec(line)?.[1]
      if (value) currentEnum.values.push(value)
      continue
    }
    if (!current) {
      pending = []
      continue
    }
    const tableMap = /^@@map\("([^"]+)"\)/.exec(line)
    if (tableMap) {
      current.table = tableMap[1]
      pending = []
      continue
    }
    const field = /^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(line)
    if (field && !line.startsWith('@@')) {
      const [, name, type, , , rest] = field
      // 관계 칸(다른 모델)도 넣지만 칼럼 이름으로만 찾으므로 실제 칼럼과 겹치지 않는다
      const trailing = /\/\/\s?(.*)$/.exec(rest)?.[1] ?? ''
      const column = /@map\("([^"]+)"\)/.exec(rest)?.[1] ?? name
      current.fields.set(column, {
        field: name,
        column,
        comment: [pending.join(' '), trailing].filter(Boolean).join(' '),
        enumName: type,
      })
      pending = []
      continue
    }
    pending = []
  }
  return { models, enums }
}

// ── 2. DB 구조 읽기 ──

type ColumnRow = {
  table_name: string
  column_name: string
  ordinal_position: number
  data_type: string
  udt_name: string
  character_maximum_length: number | null
  numeric_precision: number | null
  numeric_scale: number | null
  datetime_precision: number | null
  is_nullable: string
  column_default: string | null
}
type ConstraintRow = {
  table_name: string
  name: string
  type: string
  columns: string[] | null
  definition: string
  ref_table: string | null
}
type IndexRow = { table_name: string; name: string; definition: string }

async function readDb() {
  const columns = await prisma.$queryRawUnsafe<ColumnRow[]>(`
    SELECT table_name::text, column_name::text, ordinal_position::int, data_type::text, udt_name::text, character_maximum_length::int,
      numeric_precision::int, numeric_scale::int, datetime_precision::int, is_nullable::text, column_default::text
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    ORDER BY table_name, ordinal_position`)
  const constraints = await prisma.$queryRawUnsafe<ConstraintRow[]>(`
    SELECT rel.relname::text AS table_name, con.conname::text AS name, con.contype::text AS type,
      ARRAY(SELECT att.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum ORDER BY k.ord)::text[] AS columns,
      pg_get_constraintdef(con.oid) AS definition,
      ref.relname::text AS ref_table
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    LEFT JOIN pg_class ref ON ref.oid = con.confrelid
    WHERE ns.nspname = 'public' AND rel.relname <> '_prisma_migrations'
    ORDER BY rel.relname, con.contype, con.conname`)
  const indexes = await prisma.$queryRawUnsafe<IndexRow[]>(`
    SELECT i.tablename::text AS table_name, i.indexname::text AS name, i.indexdef AS definition
    FROM pg_indexes i
    WHERE i.schemaname = 'public' AND i.tablename <> '_prisma_migrations'
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = i.indexname)
    ORDER BY i.tablename, i.indexname`)
  return { columns, constraints, indexes }
}

// 타입 글자: VARCHAR(50) · DECIMAL(18,3) · TIMESTAMP(3) · enum 이름
function typeText(c: ColumnRow) {
  switch (c.data_type) {
    case 'character varying':
      return `VARCHAR(${c.character_maximum_length})`
    case 'character':
      return `CHAR(${c.character_maximum_length})`
    case 'numeric':
      return c.numeric_precision ? `DECIMAL(${c.numeric_precision},${c.numeric_scale})` : 'DECIMAL'
    case 'timestamp without time zone':
      return `TIMESTAMP(${c.datetime_precision})`
    case 'timestamp with time zone':
      return `TIMESTAMPTZ(${c.datetime_precision})`
    case 'USER-DEFINED':
      return `ENUM ${c.udt_name}`
    default:
      return c.data_type.toUpperCase()
  }
}

const defaultText = (value: string | null) =>
  value === null
    ? ''
    : value.startsWith('nextval(')
      ? '자동 증가'
      : value.replace(/::[\w ]+(\[\])?/g, '').replace(/^'(.*)'$/, '$1')

// 영역: 표 이름으로 묶는다 (목차 정렬·구분용)
const AREAS: [RegExp, string][] = [
  [/^(tb_user|tb_session|tb_account|tb_verification|tb_perm|tb_user_)/, '인증·권한'],
  [/^tb_(operator|org|platform)/, '운영사·조직'],
  [/^tb_(center|warehouse|zone|location)/, '센터·창고·로케이션'],
  [/^tb_region|^tb_address/, '권역·주소'],
  [/^tb_(unit|operator_unit|pallet)/, '단위·팔레트'],
  [/^tb_shipper/, '화주사'],
  [/^tb_api/, '연동 API'],
  [/^tb_(customer|ship_to)/, '거래처·납품처'],
  [/^tb_item/, '품목'],
  [/^tb_(asn|inbound|putaway)/, '입고'],
  [/^tb_stock/, '재고'],
  [/^tb_(code|ext_code|external|master|sys|doc)/, '공통·설정'],
]
const areaOf = (table: string) => AREAS.find(([re]) => re.test(table))?.[1] ?? '기타'
// 목차 순서: 업무 흐름 순 (위 목록 순서, 기타는 맨 뒤)
const areaRank = (table: string) => {
  const index = AREAS.findIndex(([re]) => re.test(table))
  return index < 0 ? AREAS.length : index
}

// ── 3. 합치기 ──

async function main() {
  const { models, enums } = parseSchema(readFileSync('prisma/schema.prisma', 'utf8'))
  const modelByTable = new Map(models.map((m) => [m.table, m]))
  const { columns, constraints, indexes } = await readDb()
  const tables = [...new Set(columns.map((c) => c.table_name))].sort(
    (a, b) => areaRank(a) - areaRank(b) || a.localeCompare(b),
  )

  type ColumnDoc = {
    no: number
    column: string
    korean: string
    field: string
    description: string
    type: string
    nullable: string
    default: string
    pk: string
    fk: string
    uk: string
  }
  type TableDoc = {
    table: string
    model: string
    area: string
    description: string
    columns: ColumnDoc[]
    checks: { name: string; definition: string }[]
    uniques: { name: string; definition: string }[]
    indexes: { name: string; definition: string }[]
  }

  const docs: TableDoc[] = tables.map((table) => {
    const model = modelByTable.get(table)
    const cons = constraints.filter((c) => c.table_name === table)
    const pkCols = new Set(cons.filter((c) => c.type === 'p').flatMap((c) => c.columns ?? []))
    const fkOf = new Map<string, string>()
    for (const c of cons.filter((x) => x.type === 'f')) {
      const target = /REFERENCES (\w+|"[^"]+")\(([^)]+)\)/.exec(c.definition)
      for (const col of c.columns ?? []) {
        fkOf.set(
          col,
          target
            ? `${target[1].replace(/"/g, '')}.${target[2].replace(/"/g, '')}`
            : (c.ref_table ?? ''),
        )
      }
    }
    const tableIndexes = indexes.filter((i) => i.table_name === table)
    const uniqueIdx = tableIndexes.filter((i) => /CREATE UNIQUE INDEX/.test(i.definition))
    const ukCols = new Set(
      uniqueIdx.flatMap((i) =>
        (/\(([^)]+)\)/.exec(i.definition)?.[1] ?? '')
          .split(',')
          .map((s) => s.trim().replace(/"/g, '')),
      ),
    )
    const cols = columns
      .filter((c) => c.table_name === table)
      .map<ColumnDoc>((c, index) => {
        const f = model?.fields.get(c.column_name)
        const enumValues = f?.enumName ? enums.get(f.enumName) : undefined
        return {
          no: index + 1,
          column: c.column_name,
          korean: pkCols.has(c.column_name)
            ? `${koreanName(c.column_name)}`
            : koreanName(c.column_name),
          field: f?.field ?? '',
          description: [
            f?.comment || COMMON_COLUMNS[c.column_name] || '',
            enumValues ? `(값: ${enumValues.join(', ')})` : '',
          ]
            .filter(Boolean)
            .join(' '),
          type: typeText(c),
          nullable: c.is_nullable === 'YES' ? 'Y' : 'N',
          default: defaultText(c.column_default),
          pk: pkCols.has(c.column_name) ? 'PK' : '',
          fk: fkOf.get(c.column_name) ?? '',
          uk: ukCols.has(c.column_name) ? 'UK' : '',
        }
      })
    const shorten = (definition: string) =>
      definition
        .replace(/ USING btree/g, '')
        .replace(/ ON public\./g, ' ON ')
        .replace(/"/g, '')
    return {
      table,
      model: model?.model ?? '',
      area: areaOf(table),
      description: model?.comment ?? '',
      columns: cols,
      checks: cons
        .filter((c) => c.type === 'c')
        .map((c) => ({ name: c.name, definition: readableCheck(c.definition) })),
      uniques: uniqueIdx.map((i) => ({ name: i.name, definition: shorten(i.definition) })),
      indexes: tableIndexes
        .filter((i) => !/UNIQUE/.test(i.definition))
        .map((i) => ({ name: i.name, definition: shorten(i.definition) })),
    }
  })

  mkdirSync(OUT_DIR, { recursive: true })
  await writeExcel(docs)
  writeMarkdown(docs)
  const columnCount = docs.reduce((sum, d) => sum + d.columns.length, 0)
  console.log(`정의서를 만들었습니다: 테이블 ${docs.length}개 · 칼럼 ${columnCount}개`)
  console.log(`  ${XLSX}`)
  console.log(`  ${MD}`)

  // ── 엑셀 ──
  async function writeExcel(list: TableDoc[]) {
    const book = new ExcelJS.Workbook()
    book.creator = 'db-doc'
    const header = (sheet: ExcelJS.Worksheet, row: number) => {
      const r = sheet.getRow(row)
      r.font = { bold: true }
      r.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E9F2' } }
        cell.border = { bottom: { style: 'thin' } }
      })
    }

    // 목차
    const toc = book.addWorksheet('목차')
    toc.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: '영역', key: 'area', width: 16 },
      { header: '테이블명', key: 'table', width: 28 },
      { header: '모델명 (코드)', key: 'model', width: 22 },
      { header: '설명', key: 'description', width: 90 },
      { header: '칼럼 수', key: 'count', width: 9 },
    ]
    header(toc, 1)
    list.forEach((d, i) => {
      const row = toc.addRow({
        no: i + 1,
        area: d.area,
        table: d.table,
        model: d.model,
        description: d.description,
        count: d.columns.length,
      })
      row.getCell('table').value = { text: d.table, hyperlink: `#'${sheetName(d.table)}'!A1` }
      row.getCell('table').font = { color: { argb: 'FF3B5BDB' }, underline: true }
      row.getCell('description').alignment = { wrapText: true, vertical: 'top' }
    })
    toc.views = [{ state: 'frozen', ySplit: 1 }]
    toc.autoFilter = { from: 'A1', to: 'F1' }

    // 테이블별 시트
    for (const d of list) {
      const sheet = book.addWorksheet(sheetName(d.table))
      sheet.getCell('A1').value = '테이블명'
      sheet.getCell('B1').value = d.table
      sheet.getCell('D1').value = '모델명'
      sheet.getCell('E1').value = d.model
      sheet.getCell('A2').value = '영역'
      sheet.getCell('B2').value = d.area
      sheet.getCell('A3').value = '설명'
      sheet.getCell('B3').value = d.description
      sheet.mergeCells('B3:J3')
      sheet.getCell('B3').alignment = { wrapText: true, vertical: 'top' }
      sheet.getRow(3).height = Math.min(120, 15 * Math.max(1, Math.ceil(d.description.length / 90)))
      for (const ref of ['A1', 'D1', 'A2', 'A3']) sheet.getCell(ref).font = { bold: true }
      sheet.getCell('L1').value = { text: '← 목차', hyperlink: "#'목차'!A1" }
      sheet.getCell('L1').font = { color: { argb: 'FF3B5BDB' }, underline: true }

      const start = 5
      const titles = [
        'No',
        '칼럼명',
        '한글명',
        '설명',
        '데이터 타입',
        'NULL',
        '기본값',
        'PK',
        'FK (참조)',
        'UK',
        '필드명 (코드)',
      ]
      sheet.getRow(start).values = titles
      header(sheet, start)
      const widths = [5, 26, 22, 64, 18, 6, 18, 5, 30, 5, 20]
      widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w))
      d.columns.forEach((c, i) => {
        const row = sheet.getRow(start + 1 + i)
        row.values = [
          c.no,
          c.column,
          c.korean,
          c.description,
          c.type,
          c.nullable,
          c.default,
          c.pk,
          c.fk,
          c.uk,
          c.field,
        ]
        row.getCell(4).alignment = { wrapText: true, vertical: 'top' }
        if (c.pk) row.font = { bold: true }
      })
      let next = start + d.columns.length + 2
      const block = (title: string, rows: { name: string; definition: string }[]) => {
        if (rows.length === 0) return
        sheet.getCell(`A${next}`).value = title
        sheet.getCell(`A${next}`).font = { bold: true }
        next++
        for (const r of rows) {
          sheet.getCell(`B${next}`).value = r.name
          sheet.getCell(`D${next}`).value = r.definition
          sheet.getCell(`D${next}`).alignment = { wrapText: true, vertical: 'top' }
          sheet.mergeCells(`D${next}:J${next}`)
          next++
        }
        next++
      }
      block('고유 인덱스 (UK)', d.uniques)
      block('인덱스', d.indexes)
      block('검사 조건 (CHECK)', d.checks)
      sheet.views = [{ state: 'frozen', ySplit: start }]
    }
    await book.xlsx.writeFile(XLSX)
  }

  // ── 문서 ──
  function writeMarkdown(list: TableDoc[]) {
    const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
    const out: string[] = [
      '# DB 테이블 정의서',
      '',
      '> 이 문서는 `npm run db:doc`가 실제 DB 구조와 `prisma/schema.prisma`의 주석으로 만든다. **손으로 고치지 않는다** — 마이그레이션을 적용한 뒤 명령을 다시 돌린다.',
      '> 엑셀 판: `docs/db/DB_테이블정의서.xlsx` · 이름 규칙: `docs/db-conventions.md`',
      '',
      `테이블 ${list.length}개 · 칼럼 ${list.reduce((s, d) => s + d.columns.length, 0)}개`,
      '',
      '## 목차',
      '',
      '| 영역 | 테이블 | 모델 | 설명 |',
      '| --- | --- | --- | --- |',
      ...list.map(
        (d) =>
          `| ${d.area} | [\`${d.table}\`](#${d.table}) | ${d.model} | ${cell(d.description)} |`,
      ),
      '',
    ]
    for (const d of list) {
      out.push(`## ${d.table}`, '', `- 영역: ${d.area} · 모델: \`${d.model}\``)
      if (d.description) out.push(`- ${cell(d.description)}`)
      out.push(
        '',
        '| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
      )
      for (const c of d.columns) {
        const keys = [c.pk, c.uk, c.fk && `FK → ${c.fk}`].filter(Boolean).join(' ')
        out.push(
          `| ${c.no} | \`${c.column}\` | ${c.korean} | ${cell(c.description)} | ${c.type} | ${c.nullable} | ${cell(c.default)} | ${keys} |`,
        )
      }
      const list2 = (title: string, rows: { name: string; definition: string }[]) => {
        if (rows.length === 0) return
        out.push(
          '',
          `**${title}**`,
          '',
          ...rows.map((r) => `- \`${r.name}\`: \`${cell(r.definition)}\``),
        )
      }
      list2('고유 인덱스', d.uniques)
      list2('인덱스', d.indexes)
      list2('검사 조건', d.checks)
      out.push('')
    }
    writeFileSync(MD, out.join('\n'))
  }
}

// 검사 조건 글자 정리: 형 변환(::bpchar 등)·겹 괄호를 빼고 = ANY (ARRAY[…]) → IN (…)
function readableCheck(definition: string) {
  let text = definition
    .replace(/::(text|bpchar|character varying|numeric|integer|bigint)(\[\])?/g, '')
    .replace(/= ANY \(\(?ARRAY\[([^\]]*)\]\)?\)/g, 'IN ($1)')
    .replace(/\((\d+(?:\.\d+)?)\)/g, '$1')
  // 겹 괄호 줄이기: ((a)) → (a), 바깥 CHECK (( … )) → CHECK ( … )
  for (let i = 0; i < 3; i++) text = text.replace(/\(\(([^()]*)\)\)/g, '($1)')
  return text.replace(/^CHECK \((\(.*\))\)$/, 'CHECK $1')
}

// 시트 이름: 31자 이하, 엑셀 금지 글자 빼기
const sheetName = (table: string) => table.replace(/[\\/?*[\]:]/g, '_').slice(0, 31)

main()
  .catch((error) => {
    console.error('정의서 만들기 실패:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
