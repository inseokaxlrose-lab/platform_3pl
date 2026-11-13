import { z } from 'zod'
import { PAGE_SIZE_OPTIONS } from '@/components/data-grid/state'
import type { DataGridState } from '@/components/data-grid/types'

// 화면에서 받은 그리드 상태 검사 (서버 액션 입력 규칙)
// 한 페이지 건수는 정해진 값만 (큰 값을 보내 DB를 무리하게 읽는 것을 막는다)
export const dataGridStateSchema = z.object({
  pageIndex: z.number().int().min(0).max(100_000),
  pageSize: z
    .number()
    .int()
    .refine(
      (size) => (PAGE_SIZE_OPTIONS as readonly number[]).includes(size),
      '허용되지 않는 건수입니다.',
    ),
  sorting: z.array(z.object({ id: z.string().max(50), desc: z.boolean() })).max(5),
  search: z.string().trim().max(100),
})

type GridQueryOptions = {
  // 검색어를 찾을 칸 (대소문자 무시, 부분 일치)
  searchFields: string[]
  // 정렬 허용 컬럼: 그리드 컬럼 id → DB 칸 (여기 없는 정렬은 무시)
  sortable: Record<string, string>
  // 정렬이 없을 때 기본 정렬
  defaultOrderBy: Record<string, 'asc' | 'desc'>
}

// 'warehouse.code' + 'asc' → { warehouse: { code: 'asc' } }
function nested(path: string, value: unknown): Record<string, unknown> {
  return path.split('.').reduceRight<unknown>((inner, key) => ({ [key]: inner }), value) as Record<
    string,
    unknown
  >
}

// 그리드 상태 → Prisma 조회 조건 { where, orderBy, skip, take }
// 데이터 범위 조건(scopeFilter)은 호출하는 쪽에서 where에 함께 넣는다
export function toPrismaQuery(state: DataGridState, options: GridQueryOptions) {
  const keyword = state.search.trim()
  const where = keyword
    ? {
        OR: options.searchFields.map((field) =>
          nested(field, { contains: keyword, mode: 'insensitive' }),
        ),
      }
    : {}

  // 허용한 컬럼만 정렬 (화면에서 보낸 이름을 DB에 그대로 넘기지 않는다)
  const orderBy = state.sorting
    .filter((sort) => options.sortable[sort.id])
    .map((sort) => nested(options.sortable[sort.id], sort.desc ? 'desc' : 'asc'))

  return {
    where,
    orderBy: orderBy.length > 0 ? orderBy : [options.defaultOrderBy],
    skip: state.pageIndex * state.pageSize,
    take: state.pageSize,
  }
}
