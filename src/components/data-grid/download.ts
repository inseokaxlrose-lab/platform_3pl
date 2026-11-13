// 브라우저에서 글자 내용을 파일로 내려받게 한다
export function downloadTextFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 내려받기가 시작된 뒤 임시 주소를 정리한다
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
