import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 테스트마다 그린 화면을 지워서 다음 테스트에 영향이 없게 한다
afterEach(() => {
  cleanup()
})
