import { describe, expect, it } from 'vitest'
import { exportFileName, toExportSheet } from './export-rows'
import type { DataGridColumn } from './types'

type Row = {
  name: string
  qty: string | number | null
  date: string | null
  status: string
  duty: string
  bizNo: string
  phone: string | null
  active: boolean
}

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
  { id: 'duty', header: '업무', accessor: 'duty', format: { code: 'DUTY' } },
  { id: 'bizNo', header: '사업자', accessor: 'bizNo', format: 'bizNo' },
  { id: 'phone', header: '전화', accessor: 'phone', format: 'phone' },
  { id: 'active', header: '사용', accessor: 'active', format: 'yn' },
]

const row = (partial: Partial<Row> = {}): Row => ({
  name: '생수',
  qty: '10',
  date: null,
  status: 'NORMAL',
  duty: 'IN',
  bizNo: '1234567891',
  phone: '021234567',
  active: true,
  ...partial,
})

const CODES = { DUTY: [{ code: 'IN', name: '입고', isActive: true }] }

describe('toExportSheet', () => {
  it('제목은 한글 이름, 넘겨준 컬럼만 넘겨준 순서대로', () => {
    expect(toExportSheet([columns[1], columns[0]], [row()]).header).toEqual(['수량', '품목명'])
  })

  it('숫자는 숫자로, 상태·코드는 이름, 번호는 하이픈, Y/N은 예·아니오, 빈 값은 빈 칸', () => {
    const sheet = toExportSheet(
      columns,
      [row(), row({ qty: null, phone: null, active: false })],
      CODES,
    )
    expect(sheet.rows).toEqual([
      ['생수', 10, null, '정상', '입고', '123-45-67891', '02-123-4567', '예'],
      ['생수', null, null, '정상', '입고', '123-45-67891', null, '아니오'],
    ])
  })

  it('날짜는 한국 시간 서식, 연결표·공통코드에 없는 값은 원래 값', () => {
    const sheet = toExportSheet(columns, [
      row({ date: '2026-11-13T05:05:00Z', status: 'NEW', duty: 'NOPE' }),
    ])
    expect(sheet.rows[0].slice(2, 5)).toEqual(['2026-11-13 14:05', 'NEW', 'NOPE'])
  })
})

describe('exportFileName', () => {
  it('이름_날짜_시각.xlsx (한국 시간)', () => {
    expect(exportFileName('센터', new Date('2026-11-13T05:05:00Z'))).toBe('센터_20261113_1405.xlsx')
  })
})
