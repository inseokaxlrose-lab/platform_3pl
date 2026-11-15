# 기준정보 입력 화면 가이드

운영사·센터·화주사·품목·거래처처럼 **한 건을 입력·수정하는 기준정보 화면**은 모두 이 틀로 만든다.
목록 화면은 `DataGrid`(`docs/decisions/0002`), 이 문서는 등록·수정 화면 이야기다.

- 부품 견본: `/dev/components` (개발 서버에서만)
- 결정 기록: `docs/decisions/0031-master-form.md`, 번호 저장 `0029`, 공통코드 `0030`
- 첫 적용 예: `src/app/admin/master/company/company-form.tsx`

## 1. 새 화면을 만드는 순서

1. **입력 규칙(Zod)** 을 `src/lib/{기준정보}/…-schema.ts`에 만든다. 화면과 서버가 같은 규칙을 쓴다.
   - 번호·이메일·주소는 `src/lib/validation/common-fields.ts`의 `optionalPhone`, `optionalEmail`, `addressShape`를 쓴다.
   - 여러 칸 규칙: `requireOneOf(['phone','email'], 문구)`, 목록 안 하나만 `exactlyOne('isPrimary', 문구)`.
2. **서버 액션**은 `createAction`으로 만든다. 입력 오류는 `contacts.0.phone`처럼 전체 위치로 돌아와 화면의 그 칸에 표시된다.
3. **화면 파일**에는 섹션·필드 정의와 그 화면 전용 로직만 둔다. `page.tsx`는 `PageHeader`와 폼을 `mx-auto w-full max-w-5xl`로 감싸 제목도 본문과 같은 폭에 둔다.

```tsx
const form = useMasterForm({ initial, schema: centerSchema, save: updateCenterAction })
const { value, set, errors } = form

return (
  <MasterFormPage
    form={form}
    readOnly={!canUpdate}
    sections={[
      {
        id: 'basic',
        title: '기본 정보',
        content: (
          <FormGrid>
            <Field label="센터명" span={8} required error={errors.name} htmlFor="center-name">
              <Input id="center-name" value={value.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="대표 전화" span={4} error={errors.phone} htmlFor="center-phone">
              <PhoneInput id="center-phone" value={value.phone} onChange={(phone) => set({ phone })} />
            </Field>
          </FormGrid>
        ),
      },
      // 새 섹션은 배열에 추가만 하면 목차에도 생긴다
    ]}
  />
)
```

`useMasterForm`과 `MasterFormPage`가 아래 동작을 맡는다. 화면에서 따로 만들지 않는다.

| 동작 | 내용 |
| --- | --- |
| 제한 폭 | 본문 `max-w-5xl` 가운데 정렬, 넓은 화면(lg)은 왼쪽에 섹션 목차 |
| 변경 감지 | 처음 값과 다르면 아래 막대에 "변경사항 있음", [저장]·[취소] 켜짐 |
| 취소 | 마지막으로 저장한 값으로 되돌림 |
| 저장 | 화면에서 먼저 검사 → 실패하면 첫 오류 칸으로 스크롤·초점, 목차의 그 섹션에 빨간 점 → 통과하면 서버 액션 → 성공하면 그 값이 새 기준 |
| 이탈 경고 | 저장하지 않은 채 화면 안 링크를 누르면 확인 창, 새로고침·창 닫기는 브라우저 확인 |
| 읽기 전용 | `readOnly`면 저장 막대 숨김 (입력 칸은 화면에서 `disabled`) |

## 2. 필드 종류별 입력 부품과 기본 span

12칸 격자(`FormGrid`) 안에서 `Field span`으로 너비를 정한다. 좁은 화면(md 미만)에서는 모두 한 줄 전체.

| 칸 종류 | 부품 (`@/components/inputs`) | 기본 span | 값 |
| --- | --- | --- | --- |
| 이름 (회사명·센터명 등) | `Input` | 8 | 글자 |
| 코드 (사용자 코드) | `Input` | 3~4 | 대문자 글자 |
| 짧은 글자 (대표자·업태·종목) | `Input` | 4 | 글자 |
| 사업자등록번호 | `BizNoInput` | 4 | 숫자 10자리 |
| 법인등록번호 | `CorpRegNoInput` | 4 | 숫자 13자리 |
| 전화·팩스·휴대폰 | `PhoneInput` | 4 | 숫자만 |
| 이메일 | `EmailInput` | 6~8 | 글자 (저장은 소문자) |
| 주소 | `AddressInput` | 12 | `{ zipCode, address, addressDetail }` |
| 공통코드 고르기 | `CodeSelect group="…"` | 호출 측 | 코드 글자 |
| 숫자 (무게·수량 등) | `NumberInput decimals min max unit` | 호출 측 | number \| null |
| 날짜 | `DateInput` | 3~4 | `'YYYY-MM-DD'` |
| 기간 | `DateRangeInput` | 6~8 | `{ from, to }` |
| 예/아니오 | `YnToggle` | 2~3 | boolean |
| 1:N 목록 | `EditableSubTable` | 섹션 전체 | 행 배열 |

- 번호는 **DB에 숫자만** 저장하고, 마스크 부품이 하이픈을 붙여 보여준다 (0029). 화면에서 `formatPhone` 등으로 미리 바꿔 넣지 않는다.
- 공통코드 목록은 `AppShell`이 나눠 준다. 그룹만 넘기면 된다 (0030).

## 3. EditableSubTable (1:N 인라인 표)

담당자·계좌·인증서·사업장처럼 한 건에 딸린 여러 행.

```tsx
<EditableSubTable
  name="contacts" // 오류 위치 앞부분: errors['contacts.0.name'], 표 전체 errors['contacts']
  rows={value.contacts}
  onChange={(contacts) => set({ contacts })}
  columns={[
    { key: 'duty', label: '담당 업무', required: true, width: '8.5rem', input: { codeGroup: 'CONTACT_DUTY' } },
    { key: 'name', label: '담당자명', required: true, width: '8rem' },
    { key: 'phone', label: '연락처', width: '10rem', input: 'phone' },
    { key: 'email', label: '이메일', input: 'email' },
    // 그 밖의 입력은 render: (cell) => <NumberInput … />
  ]}
  createRow={() => ({ ...EMPTY_CONTACT })}
  maxRows={5}
  primary={{ key: 'isPrimary', label: '대표' }} // 하나만 고르는 칸 (선택)
  errors={errors}
  addLabel="담당자 추가"
/>
```

- 섹션 제목에 `(현재/최대)`를 붙인다: ``title: `담당자 (${rows.length}/5)` ``
- 최대 개수에서 [추가]가 꺼지고, `minRows` 이하로는 지울 수 없다.
- 삭제는 확인 없이 바로. 저장 전이면 화면 [취소]로 되돌릴 수 있다.
- `primary`: 처음 추가한 행이 자동으로 대표, 대표 행을 지우면 남은 첫 행이 대표. 규칙은 `exactlyOne`으로도 검사한다.
- 넓은 화면은 한 행 한 줄, 좁은 화면은 행마다 세로 블록(칸마다 이름표)으로 바뀐다.

## 4. 하지 말 것

- **카드 안에 카드** (테두리 중첩). 섹션은 구분선으로 나눈다. 행 블록 테두리는 좁은 화면에서만.
- **화면 폭 전체로 늘어나는 입력칸.** 반드시 `FormGrid` + `span`으로 너비를 정한다.
- **화면별 자체 마스크·검사.** 번호 포맷은 `src/lib/format/`, 검사는 `common-fields.ts`, 입력은 `@/components/inputs`. 없으면 공통에 추가하고 `/dev/components`에 견본을 넣는다.
- **브라우저 기본 `confirm()`.** 확인은 `ConfirmDialog`, 이탈 확인은 `MasterFormPage`가 한다.
- **고르기 값 하드코딩.** 분류·표시용 목록은 공통코드로 (0030).
- 1:N 행을 카드로 길게 늘어놓기 → `EditableSubTable`.

## 5. 남은 제약

- 브라우저 **[뒤로]** 버튼은 막지 못한다 (App Router에 이동 직전 알림이 없음). 링크 클릭·새로고침·창 닫기만 확인한다.
- `DateInput`은 브라우저 기본 날짜 칸이다. 달력 디자인이 필요해지면 shadcn calendar로 바꾼다 (사용법은 그대로).
- 팝업·도구 화면(로케이션 일괄 생성 등)처럼 "저장"이 아닌 작은 입력은 `FormSection`(구분선)·`FormRow`·`FormField`를 쓴다. 예전 좌우 2단(`FormColumns`)은 지웠다.

---

# 목록·검색 화면 가이드

센터·화주사·품목·거래처처럼 **여러 건을 찾아보는 목록 화면**은 모두 이 틀로 만든다.

- 부품 견본: `/dev/components` 아래쪽 "목록·검색 화면 틀"
- 결정 기록: `docs/decisions/0032-master-list.md`
- 첫 적용 예: `src/app/admin/master/centers/centers-list.tsx`

## 1. 새 목록 화면을 만드는 순서

1. **서버 액션**: 입력은 `listQuerySchema`, 조건은 `list-filters.ts` 함수로 해석, 페이지·정렬·검색어는 `toPrismaQuery`.

```ts
export const listCentersAction = createAction({
  permission: 'master.centers.read',
  input: listQuerySchema, // { pageIndex, pageSize, sorting, search, filters, exportAll? }
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.centers.export')) throw new ActionError('FORBIDDEN', '…')
    const { filters } = input
    const query = toPrismaQuery(input, { searchFields: ['code', 'name'], sortable: { … }, defaultOrderBy: { code: 'asc' } })
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, CENTER_SCOPE), // 데이터 범위는 항상
        filters.status === 'ACTIVE' ? { isActive: true } : {},
        digitsFilter(filters, 'phone') ? { phone: digitsFilter(filters, 'phone') } : {},
      ],
    }
    // … findMany({ ...query, where }) + count({ where }) → { rows, rowCount }
  },
})
```

2. **화면 파일**(`*-list.tsx`)에는 검색 조건 정의 + 컬럼 정의 + 조회 함수 + 화면 전용 로직(일괄 처리 등)만.

```tsx
const SEARCH_FIELDS: SearchFieldDef[] = [
  { key: 'keyword', label: '검색어', type: 'keyword', span: 4 },
  { key: 'status', label: '상태', type: 'segment', options: [{ value: 'ACTIVE', label: '사용' }, …] },
  { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
]
const COLUMNS: DataGridColumn<Row>[] = [
  { id: 'code', header: '센터 코드', accessor: 'code', pinned: true, href: (r) => `/…/${r.id}` },
  { id: 'phone', header: '대표 전화', accessor: 'phone', format: 'phone' },
  { id: 'updatedAt', header: '수정일시', accessor: 'updatedAt', format: 'datetime', defaultHidden: true },
]

export function CentersList({ actions, canExport }) {
  const list = useListQuery<Row>({ gridId: 'master-centers', fields: SEARCH_FIELDS, fetch: listCentersAction })
  return (
    <MasterListPage title="센터" actions={actions} gridId="master-centers" searchFields={SEARCH_FIELDS}
      list={list} columns={COLUMNS} getRowId={(r) => r.id} rowHref={(r) => `/…/${r.id}`}
      excelName={canExport ? '센터' : undefined} />
  )
}
```

3. **page.tsx**는 권한을 확인해 버튼·엑셀·일괄 처리 여부만 넘긴다. 상세·수정 화면 머리에는 `<BackToListButton listPath="/admin/master/centers" />`.
4. 정적 페이지에서 쓰면 `useSearchParams` 때문에 `<Suspense>`로 감싼다 (로그인 화면들은 이미 동적이라 필요 없음).

`MasterListPage`·`useListQuery`가 맡는 것 (화면에서 따로 만들지 않는다):

| 동작 | 내용 |
| --- | --- |
| URL 동기화 | `?q=…&status=…&page=2&size=50&sort=name.desc` — 기본값은 넣지 않음. 상세에 갔다 뒤로 와도, 주소를 공유해도 같은 결과 |
| 조회 | [조회]·Enter로만 적용, 조건이 바뀌면 1페이지로. 마지막 요청의 응답만 쓰고 같은 요청이 진행 중이면 다시 보내지 않음 |
| 자동 조회 | 기본은 들어오자마자 조회. 건수가 아주 많은 화면은 `autoSearch: false` |
| 스크롤 | 목록 주소별로 기억했다가 돌아오면 데이터를 그린 뒤 되돌림 |
| 상태 | 로딩(뼈대), 결과 없음(조건이 있으면 [조건 초기화]), 오류([다시 시도]) |
| 결과 툴바 | 선택 건수, 일괄 처리 버튼(선택이 없으면 꺼짐), [엑셀], 행 높이, [컬럼] / 아래에 총 건수·범위·건수 선택·페이지 이동 |
| 컬럼 설정 | 사용자별 숨김·순서·너비·건수·정렬 서버 저장 (0021), [기본값 되돌리기] |

## 2. 검색 조건 종류

| type | 입력 | URL 값 | 서버 해석 |
| --- | --- | --- | --- |
| keyword | 통합 검색어 (화면에 하나) | `q` | `toPrismaQuery`의 `searchFields` |
| text | 글자 | 그대로 | `textFilter` |
| bizNo / phone | 번호 마스크, 하이픈 넣어도 숫자로 | 숫자 | `digitsFilter` |
| select / code | 하나 고르기 (code는 공통코드 그룹) | 값 | 그대로 비교 |
| multi / codeMulti | 여러 개 고르기 | `A,B` | `codesFilter` |
| segment | 버튼 묶음 (전체 / …) | 값 | 그대로 비교 |
| yn | 전체 / 예 / 아니오 | `Y`·`N` | `ynFilter` |
| dateRange | 기간 | `2026-11-01~2026-11-30` | `dateRangeFilter` (한국 날짜, 종료일 하루 포함) |
| numberRange | 숫자 범위 | `10~100` | `numberRangeFilter` |
| custom | 화면 전용 입력 (`render`) | 화면이 정함 | 화면이 정함 |

- **기본 조건은 자주 쓰는 3~4개만**(보통 검색어 + 상태 + 1~2개). 나머지는 `detail: true`로 [상세 조건]에. 상세 조건을 쓰고 있으면 펼친 채로 시작하고 개수가 보인다.
- span: 검색어 4, 나머지 3, 기간·숫자 범위 6. 기본 조건 줄에 남는 칸이 3칸 이상이면 버튼이 그 자리에 붙는다.

## 3. cellType(컬럼 format)과 정렬

| format | 표시 | 기본 정렬 |
| --- | --- | --- |
| (없음) / `'text'` | 그대로, 길면 말줄임 + 마우스를 올리면 전체 | 왼쪽 |
| `{ code: 그룹 }` | 공통코드 → 이름 | 가운데 |
| `{ status: … }` | 상태 배지 | 가운데 |
| `'bizNo'` / `'phone'` | 하이픈 | 가운데 |
| `'date'` / `'datetime'` | 2026-11-15 / 2026-11-15 14:05 | 가운데 |
| `'number'` / `{ number: { decimals, unit } }` | 쉼표, 소수, 단위 | 오른쪽 |
| `'yn'` | 예 / 아니오 배지 | 가운데 |
| `href` (컬럼 속성) | 링크 (코드 → 상세) | — |
| `cell` (컬럼 속성) | 화면 전용 렌더러 | — |

- 그 밖의 컬럼 속성: `pinned`(왼쪽 고정, 코드·명칭), `defaultHidden`(처음 숨김), `hideable: false`, `width`, `sortable`.
- 엑셀은 같은 format으로 변환한다 (숫자는 숫자 칸, 코드·상태는 이름, 번호는 하이픈).

## 4. 목록 API 공통 형식

```
요청 (listQuerySchema): { pageIndex: 0부터, pageSize: 20|50|100, sorting: [{ id, desc }], search, filters: { 키: 글자 }, exportAll?: true }
응답: { rows: [...], rowCount: 전체 건수 }
```

- 서버 페이징·서버 정렬이 기본. 정렬은 서버의 `sortable` 목록에 있는 컬럼만 적용된다.
- **엑셀**: `exportAll: true`면 페이지 대신 조건에 맞는 전체(최대 `EXPORT_LIMIT` = 1만 건)를 준다. 엑셀 권한(`메뉴.export`)을 서버에서 다시 확인한다. 파일은 브라우저가 exceljs로 만든다(`화면명_YYYYMMDD_HHmm.xlsx`).
- **1만 건이 넘는 엑셀(제안, 아직 안 만듦)**: 서버 작업으로 파일을 만들어 저장소에 두고, 다 되면 알림·내려받기 링크를 주는 방식. 그때는 브라우저에서 행을 받지 않는다.
- **데이터 범위**: 운영사 1곳 전용이라 tenant 조건은 없다. 센터·화주 범위는 각 서버 액션에서 `scopeFilter`로 반드시 건다 (공통 계층 자동 적용이 아님 — DB 테스트로 확인).

## 5. 하지 말 것

- 화면별 자체 페이징·URL 처리·`useEffect` 조회 (→ `useListQuery`)
- 전체를 받아 화면에서 거르기 (→ 서버 조건)
- 화면별 엑셀 구현 (→ `excelName` + `exportAll`)
- 검색 조건을 기본 영역에 다 늘어놓기 (→ 자주 쓰는 3~4개만, 나머지 `detail`)
