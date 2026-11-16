import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 빌드 폴더: 브라우저 테스트(e2e)는 '.next-e2e'로 따로 띄워 개발 서버와 겹치지 않게 (docs/decisions/0065)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // 화면 도움말 문서는 실행 중에 파일로 읽는다 → 배포 묶음에 함께 넣는다 (docs/decisions/0023)
  outputFileTracingIncludes: {
    '/admin/**': ['./src/content/help/**/*'],
    '/portal/**': ['./src/content/help/**/*'],
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
