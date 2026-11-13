import { Button } from '@/components/ui/button'

// 임시 확인용 화면: shadcn/ui 설정이 동작하는지 확인한다
// 실제 화면 뼈대(/admin, /portal)는 "기본 레이아웃" 작업에서 만든다
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background p-8 text-foreground">
      <h1 className="text-2xl font-semibold">3PL 관리 플랫폼</h1>
      <p className="text-muted-foreground">shadcn/ui 설정 확인</p>
      <div className="flex gap-3">
        <Button>기본 버튼</Button>
        <Button variant="outline">외곽선 버튼</Button>
        <Button variant="secondary">보조 버튼</Button>
      </div>
    </main>
  )
}
