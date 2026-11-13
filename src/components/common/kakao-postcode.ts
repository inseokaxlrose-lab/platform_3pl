// 카카오 우편번호 서비스 불러오기 (API 키 없음, https://postcode.map.kakao.com/guide)
// 외부 스크립트라 처음 쓸 때 한 번만 불러온다. 막혀 있으면(사내망 등) 실패 → 화면에서 직접 입력으로 대신한다

export const KAKAO_POSTCODE_SCRIPT =
  'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'

// 우리가 쓰는 검색 결과 항목만
export type KakaoPostcodeResult = {
  zonecode: string
  address: string
  roadAddress: string
  jibunAddress: string
  userSelectedType: 'R' | 'J'
  buildingName: string
  apartment: 'Y' | 'N'
  bname: string
}

type KakaoPostcodeOptions = {
  oncomplete: (data: KakaoPostcodeResult) => void
  width?: string | number
  height?: string | number
}

export type KakaoPostcodeConstructor = new (options: KakaoPostcodeOptions) => {
  embed: (element: HTMLElement, options?: { q?: string; autoClose?: boolean }) => void
}

declare global {
  interface Window {
    kakao?: { Postcode?: KakaoPostcodeConstructor }
  }
}

let loading: Promise<KakaoPostcodeConstructor> | null = null

export function loadKakaoPostcode(): Promise<KakaoPostcodeConstructor> {
  if (window.kakao?.Postcode) return Promise.resolve(window.kakao.Postcode)
  loading ??= new Promise<KakaoPostcodeConstructor>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = KAKAO_POSTCODE_SCRIPT
    script.async = true
    script.onload = () =>
      window.kakao?.Postcode ? resolve(window.kakao.Postcode) : reject(new Error('no Postcode'))
    script.onerror = () => reject(new Error('load failed'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    // 실패하면 다음에 다시 시도할 수 있게 비운다
    loading = null
    throw error
  })
  return loading as Promise<KakaoPostcodeConstructor>
}

// 검색 결과 → 저장할 주소: 도로명 주소를 기본으로, 건물명은 괄호로 덧붙인다 (카카오 안내 예시 방식)
export function toAddress(data: KakaoPostcodeResult) {
  const base = data.userSelectedType === 'J' ? data.jibunAddress : data.roadAddress || data.address
  const extras = [
    data.userSelectedType === 'R' && /[동로가]$/.test(data.bname) ? data.bname : '',
    data.userSelectedType === 'R' && data.apartment === 'Y' ? data.buildingName : '',
  ].filter(Boolean)
  return {
    zipCode: data.zonecode,
    address: extras.length > 0 ? `${base} (${extras.join(', ')})` : base,
  }
}
