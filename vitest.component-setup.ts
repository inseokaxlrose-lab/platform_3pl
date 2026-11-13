import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 테스트마다 그린 화면을 지워서 다음 테스트에 영향이 없게 한다
afterEach(() => {
  cleanup()
})

// 가짜 브라우저(jsdom)에 없는 기능 채우기: Radix 부품(드롭다운·선택 상자)이 사용한다
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
}
