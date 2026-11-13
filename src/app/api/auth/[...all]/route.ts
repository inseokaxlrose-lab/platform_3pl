import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

// Better Auth 연결 통로: /api/auth/* 요청(세션 확인 등)을 Better Auth가 처리한다
export const { GET, POST } = toNextJsHandler(auth)
