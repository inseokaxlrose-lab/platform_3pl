import { PageNotFound } from '@/components/common/page-states'

// 운영사 화면: 없는 데이터·주소 (notFound()) (0066)
export default function AdminNotFound() {
  return <PageNotFound homeHref="/admin" />
}
