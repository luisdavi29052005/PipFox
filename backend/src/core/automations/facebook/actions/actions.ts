import { Page, ElementHandle } from 'playwright'
import { postComment, type PostCommentInput, type PostCommentResult } from './postComment'

export type { PostCommentInput, PostCommentResult }

/**
 * Router de ações do Facebook. Mantém a interface estável
 * e delega a implementação para módulos especializados.
 */
export const actions = {
  /**
   * Public API para comentar em um post.
   * Aceita tanto o ElementHandle do post quanto a URL do post.
   */
  async postComment(input: PostCommentInput): Promise<PostCommentResult> {
    return postComment(input)
  }
}

export type FacebookActions = typeof actions