import { configDefaults, defineConfig } from 'vitest/config'

// 테스트는 파일 이름으로 종류를 구분한다 (docs/decisions/0007-testing.md)
// - *.test.ts     → unit      : 순수 로직, Node 환경
// - *.test.tsx    → component : 화면 부품, jsdom(가짜 브라우저) 환경
// - *.db.test.ts  → db        : 테스트 전용 DB에 연결
export default defineConfig({
  // tsconfig.json의 경로 별칭(@/...)을 그대로 사용 (Vite 8 기본 기능)
  resolve: { tsconfigPaths: true },
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./vitest.component-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/**/*.db.test.ts'],
          setupFiles: ['./vitest.db-setup.ts'],
          // 같은 DB를 쓰므로 파일을 동시에 실행하지 않는다 (데이터 충돌 방지)
          fileParallelism: false,
        },
      },
    ],
  },
})
