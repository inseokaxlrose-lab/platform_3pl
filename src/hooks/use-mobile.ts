import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// 화면 폭 변화를 구독한다 (폭이 기준을 넘나들 때 React에 알림)
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

// 화면 폭이 모바일 기준(768px) 미만인지 알려준다
// shadcn 기본 구현(useEffect 안에서 setState)을 React 권장 방식인 useSyncExternalStore로 변경
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    // 서버에서 그릴 때는 화면 폭을 알 수 없으므로 데스크톱으로 가정
    () => false,
  )
}
