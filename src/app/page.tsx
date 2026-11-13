import Link from 'next/link'
import { Button } from '@/components/ui/button'

// 임시 입구 화면: 두 화면으로 이동한다
// M1에서 로그인이 생기면 사용자 역할에 따라 자동으로 이동하도록 바꾼다
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background p-8 text-foreground">
      <h1 className="text-2xl font-semibold">3PL 관리 플랫폼</h1>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/admin">운영사 화면</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/portal">화주 포털</Link>
        </Button>
      </div>
    </main>
  )
}
