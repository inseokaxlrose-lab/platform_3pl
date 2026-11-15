import { AsyncLocalStorage } from 'node:async_hooks'

// 지금 DB를 바꾸는 사람 (등록·수정자 칸 created_by/updated_by에 자동으로 들어간다, docs/db-conventions.md)
// 서버 액션(createAction)은 로그인 사용자 아이디로, 시드는 'seed'로 감싸서 실행한다
// 감싸지 않은 곳(테스트 준비 데이터 등)은 'system'
const storage = new AsyncLocalStorage<string>()

export const SYSTEM_ACTOR = 'system'

// fn 안에서 일어나는 DB 쓰기의 작업자를 username으로 정한다
// 결과를 이 안에서 기다린다: Prisma 쿼리는 await할 때 실행되므로, 밖에서 기다리면 작업자 정보가 사라진다
export async function runAsActor<T>(username: string, fn: () => T | PromiseLike<T>): Promise<T> {
  return storage.run(username.slice(0, 50), async () => await fn())
}

// 지금 작업자 아이디 (없으면 'system')
export function currentActor(): string {
  return storage.getStore() ?? SYSTEM_ACTOR
}
