import path from 'path'

export function getUserDataDir(userId: string, accountId: string) {
  const base = process.env.SESSIONS_DIR || path.resolve(process.cwd(), 'sessions')
  return path.join(base, userId, accountId)
}
