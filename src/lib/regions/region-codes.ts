import { codeSet } from '@/config/operator-codes'

// 권역설정 상수 (docs/decisions/0076) — 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건
// (스펙은 공통코드였으나 창고 유형과 같은 규칙: 운영사가 바꿀 수 없어야 한다, 0030·0040)

// 배정표의 온도대 'ALL' = 모든 온도대 (온도대 공통코드에는 넣지 않는다). 온도대별 행이 ALL보다 먼저
export const TEMP_ZONE_ALL = 'ALL'

export const REGION_ASSIGN_TYPE = codeSet({
  MANUAL: '사용자 지정',
  SUGGESTED: '자동 추천',
  UPLOAD: '엑셀 업로드',
})

export const REGION_CHANGE_TYPE = codeSet({
  TREE_ASSIGN: '지역 선택 지정',
  GRID_ASSIGN: '우편번호 선택 지정',
  PASTE: '붙여넣기',
  UPLOAD: '엑셀 업로드',
  UNASSIGN: '배정 해제',
  SUGGEST: '신규 우편번호 추천',
  CONFIRM: '추천 확인',
})

// 주소 정제 등급: 높은 순 A > B > C > D > F
export const ADDR_GRADE = codeSet({
  A: '건물 확정',
  B: '우편번호 확정',
  C: '법정동 추정',
  D: '시군구 추정',
  F: '실패',
})
export type AddrGrade = (typeof ADDR_GRADE.values)[number]

// 등급이 기준 이상인지 (예: 운영사 자동 지정 등급 'D' → A~D면 자동)
const GRADE_ORDER: AddrGrade[] = ['A', 'B', 'C', 'D', 'F']
export const gradeAtLeast = (grade: AddrGrade, threshold: AddrGrade) =>
  GRADE_ORDER.indexOf(grade) <= GRADE_ORDER.indexOf(threshold)

export const ADDR_NORM_METHOD = codeSet({
  API_EXACT: '원본 검색',
  API_CLEANED: '정리 후 검색',
  MULTI_SAME_ZIP: '다건 동일 우편번호',
  TEXT_PARSE: '텍스트 해석',
  ZIP_ONLY: '우편번호만 확인',
  CACHE: '캐시',
  LOCAL_DB: '로컬 DB',
})
