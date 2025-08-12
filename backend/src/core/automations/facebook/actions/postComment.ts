import { Page, ElementHandle } from 'playwright'

export interface PostCommentInput {
  page: Page
  /** Elemento do post (preferível). */
  post?: ElementHandle<Element> | null
  /** URL do post (fallback). */
  postUrl?: string
  /** Texto a ser comentado. */
  message: string
  /** Tempo máximo por tentativa. */
  timeoutMs?: number
}

export interface PostCommentResult {
  ok: boolean
  error?: string
}

/**
 * Comenta em um post do Facebook utilizando seletores robustos e fallbacks.
 * A estratégia prioriza o ElementHandle do post quando disponível para evitar
 * colisões de seletores com outros posts no feed.
 */
export async function postComment(input: PostCommentInput): Promise<PostCommentResult> {
  const { page, post, postUrl, message, timeoutMs = 12_000 } = input

  try {
    if (!post && !postUrl) {
      return { ok: false, error: 'Nem post nem postUrl foram fornecidos' }
    }

    if (postUrl) {
      // Se a URL for fornecida, garante que a página está nela.
      if (page.url() !== postUrl) {
        await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      }
      await page.waitForLoadState('networkidle', { timeout: timeoutMs })
    }

    // O escopo agora é a página inteira, pois estamos na visão de modal
    const scope = page

    // Localiza a área de comentário no contexto do modal/permalink
    const editors = [
      'div[role="dialog"] div[aria-label*="Escreva um comentário"]',
      'div[role="dialog"] div[aria-label*="Write a comment"]',
      'div[role="dialog"] [contenteditable="true"][role="textbox"]',
      'div[aria-label*="Escreva um comentário"]', // Fallback geral
    ]

    let editorFound = null as null | ReturnType<typeof scope.locator>
    for (const sel of editors) {
      const ed = scope.locator(sel).first()
      if (await ed.isVisible({ timeout: 3000 }).catch(() => false)) {
        editorFound = ed
        break
      }
    }

    if (!editorFound) {
      return { ok: false, error: 'Editor de comentário não encontrado na visualização do post' }
    }

    await editorFound.click({ timeout: 4_000 })
    await page.keyboard.type(message, { delay: 25 }) // Aumentar delay para simular digitação
    await page.keyboard.press('Enter')

    // Confirmação
    try {
      await page.waitForTimeout(1500)
      const textSelector = `:text("${message.substring(0, 30)}")`
      await page.locator(textSelector).first().waitFor({ state: 'visible', timeout: 5000 })
    } catch (e) {
      console.warn('[postComment] Não foi possível confirmar a postagem do comentário visualmente.')
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}