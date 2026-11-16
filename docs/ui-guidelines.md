# 페이지 틀 (모든 화면 공통)

목록·편집 화면이 같은 바깥 틀을 쓴다 — `AppPage`(`src/components/app-page/`). 결정: `docs/decisions/0036-app-page.md`.

## 간격 토큰 (`src/app/globals.css` `@theme`)

| 토큰 | 값 | 클래스 예 | 쓰는 곳 |
| --- | --- | --- | --- |
| `--spacing-page` | 24px | `px-page`, `p-page` | 본문·헤더 좌우 여백, 헤더-본문 간격 (AppShell 본문 여백도 이 값) |
| `--spacing-section` | 24px | `gap-section`, `pt-section` | 카드 사이(검색 ↔ 그리드), 편집 섹션 사이 |
| `--spacing-card` | 16px | `p-card` | 카드 안쪽 여백 (검색 영역) |
| `--spacing-toc` | 200px | `w-toc` | 편집 화면 왼쪽 목차 |
| `--container-form` | 1040px | `max-w-form` | 편집 화면 본문 최대 폭 |

## AppPage

- **상단 바 + 메뉴 탭 줄**(0069): 함께 맨 위에 고정, 높이 6rem(3.5 + 2.5). 탭은 책갈피 방식(마지막 주소로 돌아감), 변경 중이면 ●, [↗] 새 창.
- **헤더**: 화면 전체 폭, 상단 바·메뉴 탭 아래(`top-24`)에 고정(sticky), 스크롤하면 아래 구분선 + 그림자. 제목 시작선 = 본문 시작선(좌우 여백 page).
  - 왼쪽: 제목 / 설명(`description`) / `meta`(마지막 수정·상태 배지, 설명 다음 줄).
  - 오른쪽 버튼 순서 고정: **보조 버튼 → 주 버튼 → [도움말](맨 오른쪽 끝)**. [도움말]은 모든 화면에서 같은 자리에 있고, 메뉴 주소로 도움말 파일을 찾아 자동 표시(화면에서 넣지 않음, 0023).
- **본문 variant**
  - `full`(목록): 화면 전체 폭. 검색 영역·결과 그리드는 카드, 사이 간격 `section`.
  - `form`(편집): 왼쪽 목차(200px, 헤더 아래 고정) + 본문(최대 1040px), **왼쪽 정렬**.
- `MasterListPage`(full)·`MasterFormPage`(form)가 감싸서 쓰므로 목록·편집 화면은 직접 쓰지 않는다. 그 밖의 화면(공통코드, 일괄 생성 등)은 `<AppPage title description>`로 감싼다.
- 편집 화면의 [취소]·[저장]은 **헤더 오른쪽**(주 버튼 [저장]이 맨 오른쪽). 본문 아래 저장 막대는 없다.

## 영역 구분

| 영역 | 모양 |
| --- | --- |
| 검색 영역, 결과 그리드 | 카드: `rounded-lg border bg-card` (검색 영역 안쪽 `p-card`) |
| 편집 폼 섹션 | 테두리 없이 제목(앞에 `bg-primary` 세로 막대, `text-lg`) + 위쪽 구분선 `border-t border-foreground/15`, 간격 `section` |
| 하위 표·그리드 툴바 | `SectionToolbar`: 왼쪽 건수(총 n건 / 2 / 5명), 오른쪽 버튼 — 표 위 |

- 테두리 색은 `border` 토큰, 모서리는 `--radius`(rounded-lg)만 쓴다.

## 입력 칸 배치 (편집·팝업 공통)

- 칸은 모두 `FormGrid` + `Field span`(12칸). 팝업도 같다(한 줄에 둘이면 span 6). 줄을 바꾸려고 빈 칸(div)을 넣지 말고 `Field newRow`.
- `Field`는 입력 아래에 안내·오류 한 줄 자리를 **늘 잡아 둔다**(안내가 없어도). 그래서 안내가 있는 칸과 없는 칸의 줄 간격이 같고, 안내는 입력에 바짝(`-mt-1`) 붙이고, `FormGrid` 줄 간격은 `gap-y-3`.
- 관련 있는 칸끼리 줄을 맞춘다 (예: 이름 8 + 코드 4 / 사업자번호 4 + 대표자 4 + 시스템 코드 4 / 업태 4 + 종목 4).

## 하지 말 것

- 화면 파일에서 `mx-auto max-w-*`로 감싸기, 화면별 여백·헤더 스타일 (→ AppPage)
- 헤더 밖(본문 아래)에 저장 버튼 두기
- 하위 표의 [추가]를 표 아래에 두기

---

# 기준정보 입력 화면 가이드

운영사·센터·화주사·품목·거래처처럼 **한 건을 입력·수정하는 기준정보 화면**은 모두 이 틀로 만든다.
목록 화면은 `DataGrid`(`docs/decisions/0002`), 이 문서는 등록·수정 화면 이야기다.

- 부품 견본: `/dev/components` (개발 서버에서만)
- 결정 기록: `docs/decisions/0031-master-form.md`, 번호 저장 `0029`, 공통코드 `0030`
- 적용 예: `src/components/operator/operator-form.tsx` (운영사 — 플랫폼 편집·운영사 자기 화면 공용), `src/app/admin/master/centers/center-form.tsx`

## 1. 새 화면을 만드는 순서

1. **입력 규칙(Zod)** 을 `src/lib/{기준정보}/…-schema.ts`에 만든다. 화면과 서버가 같은 규칙을 쓴다.
   - 번호·이메일·주소는 `src/lib/validation/common-fields.ts`의 `optionalPhone`, `optionalEmail`, `addressShape`를 쓴다.
   - 여러 칸 규칙: `requireOneOf(['phone','email'], 문구)`, 목록 안 하나만 `exactlyOne('isPrimary', 문구)`.
2. **서버 액션**은 `createAction`으로 만든다. 입력 오류는 `contacts.0.phone`처럼 전체 위치로 돌아와 화면의 그 칸에 표시된다.
3. **화면 파일**에는 섹션·필드 정의와 그 화면 전용 로직만 둔다. `page.tsx`는 폼에 `header={{ title, description, meta, actions }}`만 넘긴다 (제목·버튼은 `MasterFormPage`가 공통 페이지 틀로 그린다 — 아래 "페이지 틀").

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
| 페이지 틀 | `AppPage(form)`: 헤더 전체 폭·고정, 왼쪽 섹션 목차 + 본문 최대 폭(`max-w-form`), 왼쪽 정렬 |
| 변경 감지 | 처음 값과 다르면 **헤더 오른쪽**에 "변경사항 있음", [취소]·[저장] 켜짐 (스크롤해도 보인다) |
| 취소 | 마지막으로 저장한 값으로 되돌림 |
| 저장 | 화면에서 먼저 검사 → 실패하면 첫 오류 칸으로 스크롤·초점, 목차의 그 섹션에 빨간 점 → 통과하면 서버 액션 → 성공하면 그 값이 새 기준 |
| 이탈 경고 | 저장하지 않은 채 화면 안 링크를 누르면 확인 창, 새로고침·창 닫기는 브라우저 확인 |
| 읽기 전용 | `readOnly`면 [취소]·[저장] 숨김 (입력 칸은 화면에서 `disabled`) |
| 따로 처리하는 섹션 | `standalone: true` — 폼 밖에 그리고 제목 옆 "바로 적용" 표시 (상태·요약 표·계정 관리 등) |

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
| 시각 | `TimeInput` | 2~3 | `'HH:MM'` (24시간, 숫자만 치면 콜론 자동) |
| 요일 | `WeekdaySelect` | 6 | 월~일 `'Y'`/`'N'` 7글자 (`[평일]`·`[매일]`) |
| 로케이션 고르기 | `LocationSelect options` | 4 | 로케이션 키 (선택지는 서버가 범위를 좁혀 넘김) |
| 상속 칸 (위 단계 값 따름) | `InheritableField` + 입력 부품 | 입력 부품과 같게 | 비우면 위 단계 값 — 아래 "상속 칸" |
| 1:N 목록 | `EditableSubTable` | 섹션 전체 | 행 배열 |

- 번호는 **DB에 숫자만** 저장하고, 마스크 부품이 하이픈을 붙여 보여준다 (0029). 화면에서 `formatPhone` 등으로 미리 바꿔 넣지 않는다.
- 공통코드 목록은 `AppShell`이 나눠 준다. 그룹만 넘기면 된다 (0030).

### 상속 칸 (`InheritableField`, 0073)

운영사 → 센터 → 화주사처럼 **위 단계 값을 기본으로 따르고, 필요할 때만 이 단계에서 정하는** 설정(출고 마감·타임존·할당 규칙·로트 관리 등).

```tsx
<Field label="출고 마감" span={3} error={errors.shipCutoffTime} htmlFor={id('shipCutoffTime')}>
  <InheritableField
    id={id('shipCutoffTime')}
    parentLabel="운영사"
    parentValue={operator.shipCutoffTime} // 화면에 보일 위 단계 값 ('' = 정하지 않음)
    inherited={value.shipCutoffTime === ''} // 비어 있으면 위 단계 값을 따르는 중
    onInheritedChange={(inherited) =>
      set({ shipCutoffTime: inherited ? '' : operator.shipCutoffTime || '17:00' })
    }
    disabled={disabled}
  >
    <TimeInput value={value.shipCutoffTime} onChange={(t) => set({ shipCutoffTime: t })} />
  </InheritableField>
</Field>
```

- **"운영사 값 사용" 체크 = 저장 값 비움(NULL)**. 체크하면 입력 부품 대신 "운영사 값: 17:00"을 보여 준다.
- 체크를 풀면 위 단계 값으로 시작해서 고친다 (빈 칸에서 시작하지 않는다).
- 위 단계 값은 화면을 그리는 서버 쪽(조회 함수)이 함께 넘긴다. 화면이 따로 불러오지 않는다.
- 업무 코드는 칸을 직접 읽지 말고 `getEffectiveSetting(key, { centerId, shipperId? })`로 실제 값을 얻는다.

## 3. EditableSubTable (1:N 인라인 표)

담당자·계좌·인증서·사업장처럼 한 건에 딸린 여러 행.

```tsx
<EditableSubTable
  name="contacts" // 오류 위치 앞부분: errors['contacts.0.name'], 표 전체 errors['contacts']
  rows={value.contacts}
  onChange={(contacts) => set({ contacts })}
  columns={[
    { key: 'duty', label: '담당 업무', required: true, width: '8.5rem', input: { codeGroup: 'CONTACT_ROLE' } },
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

- 표 **위** 툴바(목록 그리드와 같은 `SectionToolbar` 배치): 왼쪽 건수 `2 / 5명`(`countUnit`), 오른쪽 [+ 추가]. 섹션 제목은 `담당자`만.
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
- 칸이 아주 적고 건수가 수십 개인 기준정보(단위·공통코드)는 별도 입력 화면 대신 **목록 + 팝업**으로 등록·수정한다 (`MasterListPage`의 `onRowClick`으로 팝업 열기, 0034).
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
        statusWhere(filters), // 상태 status_cd (사용 / 사용 중지, 0038)
        deletedWhere(filters), // "삭제됨" 보기 (지울 수 있는 목록만)
        digitsFilter(filters, 'phone') ? { phone: digitsFilter(filters, 'phone') } : {},
      ],
    }
    // … findMany({ ...query, where }) + count({ where }) → { rows, rowCount }
  },
})
```

2. **화면 파일**(`*-list.tsx`)에는 검색 조건 정의 + 컬럼 정의 + 조회 함수 + 화면 전용 로직(일괄 처리 등)만.
   - 고정(`pinned`)한 코드·번호 컬럼(id가 `code`·`…Code`·`…No`)은 `width`를 주지 않으면 **내용 너비로 좁혀진다** (표가 화면 폭을 채우며 남는 폭을 나눠 가져 넓어지는 것을 막는다). 직접 조절한 너비가 있으면 그것을 따른다.

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
- **데이터 범위**: 각 서버 액션에서 `scopeFilter`(센터·화주로 나누는 데이터) 또는 `operatorFilter`(운영사 공통 데이터: 단위·공통코드·권한그룹·사용자)로 반드시 건다. 운영사 조건은 `scopeFilter`가 자동으로 넣고, 서버 액션 안에서는 Prisma 안전망도 한 번 더 거른다 (멀티테넌트 두 겹, `docs/decisions/0039`). 화면 조회 함수(`queries.ts`)는 안전망 밖이라 범위를 꼭 쓴다 — DB 테스트로 확인.

## 5. 하지 말 것

- 화면별 자체 페이징·URL 처리·`useEffect` 조회 (→ `useListQuery`)
- 전체를 받아 화면에서 거르기 (→ 서버 조건)
- 화면별 엑셀 구현 (→ `excelName` + `exportAll`)
- 검색 조건을 기본 영역에 다 늘어놓기 (→ 자주 쓰는 3~4개만, 나머지 `detail`)
