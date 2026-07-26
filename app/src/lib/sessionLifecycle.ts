export function sessionDeletionMessage(name: string): string {
  return `"${name}" 세션을 삭제할까요?\n실행 중인 프로세스를 종료하고 MultiAgent 목록에서 제거합니다.\n이 동작은 되돌릴 수 없습니다.`;
}
