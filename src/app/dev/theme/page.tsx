import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { CommonComponentsDemo } from './common-components-demo'

export const metadata: Metadata = { title: '디자인 견본' }

// 색상 토큰 견본: 배경색 클래스와 이름 (토큰 이름만 사용, 실제 값은 globals.css)
const COLOR_TOKENS = [
  { name: 'background', className: 'bg-background' },
  { name: 'card', className: 'bg-card' },
  { name: 'muted', className: 'bg-muted' },
  { name: 'border', className: 'bg-border' },
  { name: 'primary', className: 'bg-primary' },
  { name: 'success', className: 'bg-success' },
  { name: 'warning', className: 'bg-warning' },
  { name: 'info', className: 'bg-info' },
  { name: 'destructive', className: 'bg-destructive' },
]

// 디자인 견본 화면: 모든 화면이 따르는 색·글꼴·부품 모양을 한곳에서 확인한다
export default function ThemePreviewPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">디자인 견본</h1>
          <p className="text-sm text-muted-foreground">
            색상 토큰 · 글꼴 · 기본 부품 · 공통 컴포넌트
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">버튼</h2>
        <div className="flex flex-wrap gap-2">
          <Button>입고 확정</Button>
          <Button variant="outline">엑셀 다운로드</Button>
          <Button variant="secondary">임시 저장</Button>
          <Button variant="ghost">취소</Button>
          <Button variant="destructive">잔량 마감</Button>
          <Button variant="link">상세 보기</Button>
          <Button disabled>처리 중</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">상태 배지</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">입고 예정</Badge>
          <Badge variant="warning">부분 입고</Badge>
          <Badge variant="success">입고 완료</Badge>
          <Badge variant="warning">유통기한 임박</Badge>
          <Badge variant="destructive">잔량 마감</Badge>
          <Badge variant="secondary">임시 저장</Badge>
          <Badge variant="outline">BOX</Badge>
          <Badge>기본</Badge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">색상 토큰</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {COLOR_TOKENS.map((token) => (
            <div key={token.name} className="space-y-1.5">
              <div className={`h-12 rounded-md border ${token.className}`} />
              <p className="font-mono text-xs text-muted-foreground">{token.name}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">글꼴 (Pretendard)</h2>
        <div className="space-y-2 rounded-lg border bg-card p-6 text-card-foreground">
          <p className="text-2xl font-bold">입고 예정 목록 (ASN)</p>
          <p className="text-lg font-semibold">화주사별 재고 현황</p>
          <p>
            3PL 운영사가 여러 센터에서 화주사의 입고·재고를 관리합니다. The quick brown fox jumps
            over the lazy dog.
          </p>
          <p className="text-sm text-muted-foreground">
            보조 설명 문구 — 로트번호와 유통기한은 품목 설정에 따라 입력합니다.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">숫자 정렬</h2>
        <p className="text-sm text-muted-foreground">
          수량·금액은 <code className="font-mono">tabular-nums</code>로 자릿수를 세로로 맞춘다
        </p>
        <div className="grid grid-cols-2 gap-6 rounded-lg border bg-card p-6 text-card-foreground">
          <div className="space-y-1 text-right">
            <p className="text-xs text-muted-foreground">기본 숫자</p>
            <p>1,111.000</p>
            <p>98,760.500</p>
            <p>4,000.250</p>
          </div>
          <div className="space-y-1 text-right tabular-nums">
            <p className="text-xs text-muted-foreground">tabular-nums</p>
            <p>1,111.000</p>
            <p>98,760.500</p>
            <p>4,000.250</p>
          </div>
        </div>
      </section>

      <hr className="border-border" />
      <CommonComponentsDemo />
    </div>
  )
}
