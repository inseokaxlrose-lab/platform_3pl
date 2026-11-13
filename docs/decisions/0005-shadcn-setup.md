# 0005. shadcn/ui 설정

- 날짜: 2026-11-13
- 상태: 채택

## 결정

`npx shadcn@latest init -t next -b radix --preset nova` (shadcn CLI 4.23)

| 항목 | 값 | 이유 |
|---|---|---|
| 바탕 엔진 (`base`) | Radix UI | 오래 검증되었고 예제·자료가 가장 많아 AI와 함께 개발하기 유리. Base UI는 최신이지만 자료가 적음 |
| 스타일 | `radix-nova` | shadcn 기본 스타일 |
| 기본 회색 (`baseColor`) | neutral | 색기 없는 회색이라 이후 포인트 컬러와 가장 잘 어울림. **초기화 후 변경 불가** |
| 테마 방식 | CSS 변수 | 라이트/다크 모드와 디자인 토큰을 변수로 관리 |
| 아이콘 | lucide-react | shadcn 기본값 |

## 참고

- 클래스 합치기 함수 `cn()`은 shadcn 팀의 `cn` 패키지(`clsx` + `tailwind-merge` 대체)를 사용한다. `src/lib/utils.ts`에서 다시 내보낸다.
- 부품은 `npx shadcn@latest add <이름>`으로 `src/components/ui/`에 추가하고, 추가 후 `npm run format`을 실행한다 (CLI가 큰따옴표로 생성하기 때문).
- init이 `globals.css`의 `--font-sans`를 자기 자신을 가리키도록 바꿔버려서, `layout.tsx`의 Geist 글꼴 변수(`--font-geist-sans`)로 고쳤다.
- 포인트 컬러·글꼴·다크 모드 전환은 M0.5 "디자인 토큰 정하기"에서 결정한다.
