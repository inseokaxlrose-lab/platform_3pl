import { describe, expect, it } from 'vitest'
import { csvFileName, toCsv } from './csv'
import type { DataGridColumn } from './types'

type Row = { name: string; qty: string | number | null; date: string | null; status: string }

const columns: DataGridColumn<Row>[] = [
  { id: 'name', header: '품목명', accessor: 'name' },
  { id: 'qty', header: '수량', accessor: 'qty', format: 'number' },
  { id: 'date', header: '변경일시', accessor: 'date', format: 'datetime' },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    format: { status: { NORMAL: { label: '정상', tone: 'success' } } },
  },
]

const row = (partial: Partial<Row>): Row => ({
  name: '생수',
  qty: '10',
  date: null,
  status: 'NORMAL',
  ...partial,
})

// BOM과 줄 단위 분리를 도와주는 함수
const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n')

describe('toCsv', () => {
  it('맨 앞에 BOM을 붙이고, 줄바꿈은 CRLF', () => {
    const csv = toCsv(columns, [row({})])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toBe('﻿품목명,수량,변경일시,상태\r\n생수,10,,정상\r\n')
  })

  it('숫자는 쉼표 없이 원래 값 그대로 (Decimal 정밀도 유지)', () => {
    const csv = toCsv(columns, [row({ qty: '12345678901234567890.125' }), row({ qty: -12.5 })])
    expect(lines(csv)[1]).toBe('생수,12345678901234567890.125,,정상')
    expect(lines(csv)[2]).toBe('생수,-12.5,,정상') // 음수는 수식 방지 대상이 아님
  })

  it('날짜는 한국 시간 서식, 상태는 라벨, 연결표에 없는 상태는 원래 값', () => {
    const csv = toCsv(columns, [row({ date: '2026-11-13T05:05:00Z', status: 'UNKNOWN' })])
    expect(lines(csv)[1]).toBe('생수,10,2026-11-13 14:05,UNKNOWN')
  })

  it('쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다', () => {
    const csv = toCsv(columns, [row({ name: '사과, "부사"\n특품' })])
    expect(csv).toContain('"사과, ""부사""\n특품",10')
  })

  it('수식처럼 시작하는 글자 값은 앞에 작은따옴표를 붙인다 (수식 주입 방지)', () => {
    const csv = toCsv(columns, [
      row({ name: '=HYPERLINK("http://evil")' }),
      row({ name: '+82-10' }),
      row({ name: '@SUM(A1)' }),
    ])
    expect(lines(csv)[1].startsWith(`"'=HYPERLINK(""http://evil"")"`)).toBe(true)
    expect(lines(csv)[2].startsWith("'+82-10,")).toBe(true)
    expect(lines(csv)[3].startsWith("'@SUM(A1),")).toBe(true)
  })

  it('넘겨준 컬럼만, 넘겨준 순서대로 내보낸다 (숨긴 컬럼 제외)', () => {
    const csv = toCsv([columns[3], columns[0]], [row({})])
    expect(lines(csv).slice(0, 2)).toEqual(['상태,품목명', '정상,생수'])
  })

  it('빈 값은 빈 칸', () => {
    expect(lines(toCsv(columns, [row({ qty: null })]))[1]).toBe('생수,,,정상')
  })
})

describe('csvFileName', () => {
  it('이름_날짜_시각.csv (한국 시간)', () => {
    expect(csvFileName('재고목록', new Date('2026-11-13T05:05:00Z'))).toBe(
      '재고목록_20261113_1405.csv',
    )
  })
})
