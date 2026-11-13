import { describe, expect, it } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { dataGridStateSchema, toPrismaQuery } from './grid-query'

const options = {
  searchFields: ['name', 'description'],
  sortable: { name: 'name', updatedAt: 'updatedAt', centerCode: 'center.code' },
  defaultOrderBy: { name: 'asc' as const },
}

describe('toPrismaQuery', () => {
  it('페이지 → skip/take', () => {
    const q = toPrismaQuery(createDataGridState({ pageIndex: 2, pageSize: 50 }), options)
    expect(q).toMatchObject({ skip: 100, take: 50 })
  })

  it('검색어 → 여러 칸 중 하나라도 포함 (대소문자 무시), 앞뒤 공백 무시', () => {
    expect(toPrismaQuery(createDataGridState({ search: '  운영 ' }), options).where).toEqual({
      OR: [
        { name: { contains: '운영', mode: 'insensitive' } },
        { description: { contains: '운영', mode: 'insensitive' } },
      ],
    })
    expect(toPrismaQuery(createDataGridState({ search: '' }), options).where).toEqual({})
  })

  it('정렬: 허용한 컬럼만, 관계 칸은 중첩, 없으면 기본 정렬', () => {
    const q = toPrismaQuery(
      createDataGridState({
        sorting: [
          { id: 'updatedAt', desc: true },
          { id: 'password', desc: false }, // 허용 목록에 없음 → 무시
          { id: 'centerCode', desc: false },
        ],
      }),
      options,
    )
    expect(q.orderBy).toEqual([{ updatedAt: 'desc' }, { center: { code: 'asc' } }])
    expect(toPrismaQuery(createDataGridState(), options).orderBy).toEqual([{ name: 'asc' }])
  })
})

describe('dataGridStateSchema (서버 입력 검사)', () => {
  it('정상 상태는 통과', () => {
    expect(dataGridStateSchema.safeParse(createDataGridState()).success).toBe(true)
  })

  it('정해지지 않은 건수·음수 페이지·너무 긴 검색어는 거부', () => {
    expect(dataGridStateSchema.safeParse(createDataGridState({ pageSize: 100000 })).success).toBe(
      false,
    )
    expect(dataGridStateSchema.safeParse(createDataGridState({ pageIndex: -1 })).success).toBe(
      false,
    )
    expect(
      dataGridStateSchema.safeParse(createDataGridState({ search: 'x'.repeat(101) })).success,
    ).toBe(false)
  })
})
