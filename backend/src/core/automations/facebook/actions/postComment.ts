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
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      await page.waitForLoadState('networkidle', { timeout: timeoutMs })
    }

    const scope = post ?? page

    // 1) Tenta focar o post (quando houver ElementHandle)
    if (post) {
      try { await post.scrollIntoViewIfNeeded() } catch {}
      try { await post.click({ timeout: 2_000 }) } catch {}
    }

    // 2) Abre a caixa de comentário se houver um botão explícito
    const openButtons = [
      '[aria-label*="Comentar"]',
      '[aria-label*="Comment"]',
      'div[role="button"][aria-label*="Comment"]',
      'div[role="button"][aria-label*="Comentar"]'
    ]
    for (const sel of openButtons) {
      const btn = scope.locator(sel).first()
      if (await btn.isVisible().catch(() => false)) {
        try { await btn.click({ timeout: 2_000 }) } catch {}
        break
      }
    }

    // 3) Localiza a área editável do comentário dentro do post (prioridade)
    const editors = [
      '[contenteditable="true"][role="textbox"]',
      'div[aria-label*="Escreva um comentário"]',
      'div[aria-label*="Write a comment"]',
      'div[aria-label*="Comentar"]'
    ]

    let editorFound = null as null | ReturnType<typeof scope.locator>
    for (const sel of editors) {
      const ed = scope.locator(sel).first()
      if (await ed.isVisible().catch(() => false)) {
        editorFound = ed
        break
      }
    }

    // Fallback global (fora do post) — menos seguro, mas útil em páginas do post
    if (!editorFound) {
      for (const sel of editors) {
        const ed = page.locator(sel).first()
        if (await ed.isVisible().catch(() => false)) {
          editorFound = ed
          break
        }
      }
    }

    if (!editorFound) {
      return { ok: false, error: 'Editor de comentário não encontrado' }
    }

    await editorFound.click({ timeout: 4_000 })

    // Digita (contenteditable não usa fill)
    await page.keyboard.type(message, { delay: 15 })

    // Envia o comentário (Enter)
    await page.keyboard.press('Enter')

    // Confirma visivelmente que o comentário apareceu (melhor esforço)
    try {
      await page.waitForTimeout(800)
      const maybeSelfComment = post ? post.locator(`:text("${message.slice(0, 20)}")`) : page.locator(`:text("${message.slice(0, 20)}")`)
      await maybeSelfComment.first().waitFor({ state: 'visible', timeout: 4_000 })
    } catch {}

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}