import crypto from 'crypto'

export interface PostMeta {
  url: string
  author: string
  text: string
  timestamp: string
}

/**
 * Gera um hash único para um post baseado no conteúdo
 */
export function generatePostHash(post: PostMeta): string {
  // Usar apenas conteúdo estável (não timestamp)
  const content = `${post.url}|${post.author}|${post.text.substring(0, 200)}`
  return crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 16)
}

/**
 * Verifica se dois posts são duplicatas
 */
export function isDuplicate(post1: PostMeta, post2: PostMeta): boolean {
  return generatePostHash(post1) === generatePostHash(post2)
}