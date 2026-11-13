// 화면 권한 부품: 바깥에서는 이 파일로 공개된 것만 사용한다
// 서버 쪽 확인은 @/lib/session 의 hasPermission / getCurrentPermissions
export { AccessDenied } from './access-denied'
export { Can } from './can'
export { PermissionProvider, usePermission } from './permission-provider'
