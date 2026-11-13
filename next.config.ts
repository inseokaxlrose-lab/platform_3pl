import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
