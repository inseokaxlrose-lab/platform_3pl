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
- 사용자·권한그룹·센터·창고 화면은 아직 예전 `FormColumns` 배치다. 다음 작업에서 이 틀로 옮긴다.
