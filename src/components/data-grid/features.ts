import {
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table'

// TanStack Table 9: 그리드에서 쓰는 기능만 골라 담는다 (안 쓰는 기능은 포함되지 않음)
// 정렬·페이지는 서버가 처리하므로 정렬/페이지 "행 모델"은 넣지 않는다 (manual 모드)
export const gridFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
})

export type GridFeatures = typeof gridFeatures
