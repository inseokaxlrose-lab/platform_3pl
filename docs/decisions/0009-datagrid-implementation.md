# 0009. DataGrid 구현 (1차)

- 날짜: 2026-11-13
- 상태: 채택
- 관련: 0002 (UI 방향과 DataGrid), 쇼케이스 `/dev/grid`

## 결정

### TanStack Table 9 사용

- 0002 작성 시점 기준은 8.x였으나 최신 9.3을 채택. 새 프로젝트라 이전 버전을 쓸 이유가 없다.
- 9.x는 쓸 기능만 골라 담는 방식(`tableFeatures`). 사용 기능: 정렬, 페이지, 행 선택, 컬럼 표시 (`src/components/data-grid/features.ts`).
- 행 데이터 타입은 TanStack의 `RowData` 조건(객체)을 따라야 한다.

### TanStack은 "상태 엔진"으로만 쓴다

- 정렬·선택·컬럼 표시 상태 계산만 TanStack에 맡기고, 헤더·셀 그리기는 우리 컬럼 정의(`DataGridColumn`)를 보고 직접 한다.
- 화면은 `DataGridColumn`(id, header, accessor, format, sortable…)만 알면 된다 → TanStack 버전이 바뀌어도 영향은 `data-grid` 폴더 안에서 끝난다.

### 서버 방식이 기본

- 정렬·페이지는 서버가 처리한다 (`manualSorting`, `manualPagination`). 그리드는 상태(`DataGridState`: pageIndex, pageSize, sorting, search)만 바꿔서 알린다.
- 데이터 범위가 바뀌는 변경(검색어·정렬·한 페이지 건수)은 1페이지로 돌아간다 (`state.ts`).
- 검색은 입력을 멈추고 0.3초 뒤에 반영한다.
- 행 선택은 `getRowId` 기준으로 저장해 페이지를 넘겨도 유지된다. 선택 결과는 id 목록으로 알린다.

### 셀 서식

- 숫자: 재고 수량(Decimal)은 문자열로 오므로 **number로 바꾸지 않고** 쉼표만 넣는다. 소수 끝 0은 지우고 반올림하지 않는다.
- 날짜: 한국 시간(Asia/Seoul) 기준. 시간이 없는 날짜 문자열(`2026-11-13`)은 변환하지 않는다 (하루 밀림 방지).
- 상태: `{ status: { 값: { label, tone } } }` 연결표 → `StatusBadge`. 연결표에 없는 값은 회색 배지로 그대로 표시 (누락이 눈에 띄게).

## 2차에서 다룰 것 (0002 기능 단계)

- 정렬·검색·페이지 상태의 URL 동기화, 컬럼 설정 저장 (`id` 사용)
- 검색·정렬이 바뀌어도 선택이 유지되는 현재 동작을 업무 화면에서 그대로 둘지 결정 (보이지 않는 행이 일괄 처리에 포함될 수 있음)
- 헤더 고정(스크롤 시), 컬럼 너비 조절·순서 변경, 왼쪽 고정 컬럼
