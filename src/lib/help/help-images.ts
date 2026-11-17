// 도움말 화면 사진 규칙 (docs/decisions/0077) — 화면·테스트·촬영 스크립트 공용
//   위치: public/help/{메뉴 주소}/{이름}.png (라이트) + {이름}.dark.png (다크)
//   문서 표기: ![설명](/help/admin/master/regions/assign.png)

export const HELP_IMAGE_PREFIX = '/help/'

// 도움말 사진 주소인지: /help/ 아래 .png, 위로 올라가는 경로(..) 없이
export function isHelpImage(src: string) {
  return src.startsWith(HELP_IMAGE_PREFIX) && src.endsWith('.png') && !src.includes('..')
}

// 라이트 사진 주소 → 다크 사진 주소 (assign.png → assign.dark.png)
export function darkImageOf(src: string) {
  return src.replace(/\.png$/, '.dark.png')
}

// 문서 속 사진 주소 모두 (![설명](주소))
export function helpImageSources(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1])
}
