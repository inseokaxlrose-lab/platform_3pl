# 0008. 디자인 토큰

- 날짜: 2026-11-13
- 상태: 채택
- 견본 화면: `/dev/theme` (개발 모드에서만 열림)

## 원칙

화면 코드에는 색 값(`#4f39f6`, `bg-indigo-600` 등)을 직접 쓰지 않고 **토큰 이름**(`bg-primary`, `text-success` 등)만 쓴다. 실제 값은 `src/app/globals.css` 한 곳에서 관리한다.

## 결정

### 포인트 컬러: Indigo

- `--brand: oklch(0.511 0.262 276.966)` (Tailwind indigo-600). `--primary`, `--ring`, `--sidebar-primary`가 모두 `--brand`를 따른다 → **바꿀 때는 `--brand` 한 줄만 수정**.
- Blue · Indigo · Teal · Violet 4종을 `/dev/theme`에서 라이트/다크로 비교해 선택.
  - Blue: 상태 색 info(파랑 계열)와 비슷해 버튼과 상태가 덜 구분됨
  - Teal: 채도가 낮아 버튼이 덜 눈에 띄고 success(초록)와 계열이 가까움
  - Violet: 업무용으로 다소 튐
  - **Indigo: 상태 색 4가지와 모두 잘 구분되고 최신 SaaS 느낌**
- 흰 글자와의 명도 대비 4.5:1 이상인 값만 후보로 사용.

### 상태 색

| 토큰 | 라이트 | 다크 | 쓰임 |
|---|---|---|---|
| `success` | green-700 | green-400 | 입고 완료, 적치 완료 |
| `warning` | amber-700 | amber-400 | 유통기한 임박, 부분 입고 |
| `info` | sky-700 | sky-400 | 입고 예정, 진행 중 |
| `destructive` (shadcn 기본) | red | red | 오류, 마감, 불량 |

- 라이트는 글자로 써도 읽히는 700 계열, 다크는 어두운 배경에서 읽히는 400 계열.
- 배지: `<Badge variant="success">` 등. 옅은 배경 + 진한 글자 형태.

### 글꼴

- 본문: **Pretendard** (한글·영문 모두 지원). npm `pretendard` 패키지의 **분할(dynamic subset) 버전**을 사용해 화면에 나온 글자가 든 조각만 내려받는다 (전체 가변 글꼴은 약 2MB).
- 고정폭: Geist Mono (코드·식별자).
- 수량·금액 숫자는 `tabular-nums`로 자릿수를 세로로 맞춘다.

### 간격 · 모서리

- 간격: Tailwind 기본 4px 단위. 표 행 높이(밀도)는 DataGrid에서 정한다.
- 모서리: `--radius: 0.5rem` (shadcn 기본 0.625rem보다 단정하게).

### 라이트 / 다크 모드

- `next-themes`, html에 `dark` 클래스. 기본값은 운영체제 설정 따라가기.
- 전환 버튼: `src/components/theme-toggle.tsx` (라이트 / 다크 / 시스템 설정). 상단 바 배치는 "앱 레이아웃" 작업에서.

## 참고

- 개발 서버 실행 중 `globals.css`를 크게 바꾸면 이전 CSS가 남아 있을 수 있다. 색이 반영되지 않으면 개발 서버를 재시작한다.
