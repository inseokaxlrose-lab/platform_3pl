import { datamatrix, drawingSVG, qrcode } from 'bwip-js/generic'

// 2D 코드 그림 (SVG 글자) — 화면에서 라벨을 그릴 때 (docs/decisions/0054)
// 라이브러리: bwip-js (QR·Data Matrix 모두, 필요한 두 종류만 불러온다)

export const CODE_TYPES = { QR: 'QR 코드', DATAMATRIX: 'Data Matrix' } as const
export type CodeType = keyof typeof CODE_TYPES

// 글자 → SVG (QR 오류 정정 단계는 라이브러리 기본값 M) (viewBox만 있고 크기는 감싸는 칸에 맞춘다)
export function codeSvg(type: CodeType, text: string): string {
  const options = { bcid: type === 'QR' ? 'qrcode' : 'datamatrix', text, scale: 2, padding: 0 }
  return type === 'QR' ? qrcode(options, drawingSVG()) : datamatrix(options, drawingSVG())
}
