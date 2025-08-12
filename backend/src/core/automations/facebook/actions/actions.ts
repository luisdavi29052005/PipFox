import { Page, ElementHandle } from 'playwright'
import { postComment, type PostCommentInput, type PostCommentResult } from './postComment'

export type { PostCommentInput, PostCommentResult }

export const actions = {
  // Agora aceita URL do post ou o próprio ElementHandle do post
  async postComment(page: Page, target: string | ElementHandle<Element>, message: string): Promise<PostCommentResult> {
    if (typeof target === 'string') {
      return postComment({ page, postUrl: target, message })
    }
    return postComment({ page, post: target, message })
  }
}
export type FacebookActions = typeof actions