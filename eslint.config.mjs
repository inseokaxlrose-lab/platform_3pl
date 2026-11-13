import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
// 코드 모양(따옴표·세미콜론 등) 규칙은 Prettier에게 맡기고, ESLint의 겹치는 규칙은 끈다
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 반드시 마지막에 두어야 앞 설정의 모양 규칙을 덮어쓴다
  prettier,
  // eslint-config-next 기본 제외 경로를 명시적으로 지정
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])

export default eslintConfig
