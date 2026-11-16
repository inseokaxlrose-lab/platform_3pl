import { PageNotFound } from '@/components/common/page-states'

// 어느 영역에도 없는 주소 (0066): 처음 화면(로그인 상태에 따라 각 영역으로 이동)으로
export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background">
      <PageNotFound homeHref="/" />
    </main>
  )
}
