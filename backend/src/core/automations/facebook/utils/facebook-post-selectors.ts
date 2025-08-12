import { Page, ElementHandle } from 'playwright'

// Feed raiz
export const FEED = '[role="feed"]'

// Exclusões mínimas e estáveis
export const EXCLUDE = [
  'div[role="dialog"] [role="article"]',
  '[data-pagelet*="Stories"] [role="article"]',
  '[aria-label*="Stories" i] [role="article"]',
  '[aria-label*="Reels" i] [role="article"]'
].join(', ')

// Heurística de ações típicas de post
export const ACTIONS = [
  '[role="toolbar"]',
  '[aria-label*="Ações" i]',
  '[aria-label*="Actions" i]',
  'div[role="group"] button[aria-label*="Curtir" i], div[role="group"] button[aria-label*="Like" i]'
]

// Localiza artigos "post principal" de forma permissiva e resiliente
export async function findAllPosts(page: Page): Promise<ElementHandle[]> {
  try {
    await page.waitForSelector(FEED, { timeout: 10000 })

    const idxList = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]')
      if (!feed) return [] as number[]
      const all = Array.from(feed.querySelectorAll('[role="article"]'))

      const looksLikePost = (article: Element) => {
        // 1 ponto forte: atributo pointset no Comet
        if ((article as HTMLElement).hasAttribute('pointset')) return true

        // 2 ações típicas
        const actions = [
          '[role="toolbar"]',
          '[aria-label*="Ações" i]',
          '[aria-label*="Actions" i]',
          'div[role="group"] button[aria-label*="Curtir" i], div[role="group"] button[aria-label*="Like" i]'
        ]
        const hasActions = actions.some(sel => article.querySelector(sel))

        // 3 timestamp clicável
        const hasTime = !!article.querySelector('a[role="link"] abbr[title], a[role="link"] time[title]')

        // 4 algum texto visível razoável
        const textEl =
          article.querySelector('[data-ad-preview="message"]') ||
          article.querySelector('[data-testid="post_message"]') ||
          article.querySelector('div[dir="auto"]')
        const hasText = !!(textEl && (textEl.textContent || '').trim().length > 5)

        // 5 não estar em modal ou stories/reels
        if (article.closest('div[role="dialog"], [data-pagelet*="Stories"], [aria-label*="Stories" i], [aria-label*="Reels" i]')) {
          return false
        }

        // 6 não parecer comentário
        const label = (article.getAttribute('aria-label') || '').toLowerCase()
        if (label.startsWith('comentário de ') || label.startsWith('comment by ')) return false
        if (article.querySelector('a[href*="comment_id="]')) return false
        if (!hasActions && article.querySelector('[placeholder*="coment" i], [aria-label*="coment" i]')) return false

        // Estratégia permissiva: precisa de 2 entre ações, tempo e texto
        const score = [hasActions, hasTime, hasText].filter(Boolean).length
        return score >= 2
      }

      const result: number[] = []
      for (let i = 0; i < all.length; i++) {
        const a = all[i] as any
        if (a.__fbop_seen) continue
        if (looksLikePost(a)) {
          a.__fbop_seen = true
          result.push(i)
        }
      }
      return result
    })

    const handles: ElementHandle[] = []
    for (const idx of idxList as number[]) {
      const h = await page.evaluateHandle((i) => {
        const feed = document.querySelector('[role="feed"]')
        if (!feed) return null
        const all = Array.from(feed.querySelectorAll('[role="article"]'))
        return all[i] || null
      }, idx)
      if (h && h.asElement()) handles.push(h.asElement() as ElementHandle)
    }

    return handles
  } catch (e: any) {
    console.error('[findAllPosts] erro:', e.message)
    return []
  }
}

// Extrai metadados essenciais do próprio card no feed
export async function extractMetaFromPost(post: ElementHandle): Promise<{ url?: string, author?: string, text?: string, image?: string } | null> {
  try {
    const meta = await post.evaluate((el) => {
      const pickPermalink = (): string => {
        const link = el.querySelector('a[href*="/permalink/"], a[href*="/posts/"]') as HTMLAnchorElement | null
        if (link) return link.href
        const any = Array.from(el.querySelectorAll('a[href]')) as HTMLAnchorElement[]
        for (const a of any) {
          const href = a.href
          const m1 = href.match(/\/(?:posts|permalink)\/(\d+)/)
          const m2 = href.match(/[?&](?:story_fbid|fbid)=(\d+)/)
          const id = m1?.[1] || m2?.[1]
          if (id) {
            const parts = location.pathname.split('/').filter(Boolean)
            const groupSlug = parts[1] || ''
            if (groupSlug) return `${location.origin}/groups/${groupSlug}/permalink/${id}/`
          }
        }
        return ''
      }

      const authorEl =
        el.querySelector('[data-testid="story-subtitle"] a[role="link"]') ||
        el.querySelector('h3 a[role="link"], h4 a[role="link"]') ||
        el.querySelector('a[role="link"] strong')
      const author = authorEl?.textContent?.trim() || null

      const textCands = [
        el.querySelector('[data-ad-preview="message"]'),
        el.querySelector('[data-testid="post_message"]'),
        el.querySelector('[data-testid="story-subtitle"] + div'),
        el.querySelector('div[dir="auto"]')
      ].filter(Boolean) as Element[]
      let text = ''
      for (const t of textCands) {
        const s = (t.textContent || '').trim()
        if (s.length > text.length) text = s
      }
      if (text.length < 5) text = ''

      const imgEl = el.querySelector('img[src*="scontent"], img[src*="fbcdn"]') as HTMLImageElement | null
      let url = pickPermalink()
      if (url) {
        try {
          const u = new URL(url)
          u.searchParams.delete('__cft__')
          u.searchParams.delete('__tn__')
          u.searchParams.delete('comment_id')
          u.searchParams.delete('reply_comment_id')
          url = u.toString()
        } catch {}
      }

      return { url: url || undefined, author: author || undefined, text: text || undefined, image: imgEl?.src || undefined }
    })
    return meta
  } catch (e: any) {
    console.error('[extractMetaFromPost] erro:', e.message)
    return null
  }
}

// Extrai dados completos da visão aberta do post, serve tanto para modal quanto página
export async function extractDataFromPostModal(page: Page): Promise<{ author: string, text: string, images: string[], timestamp: string } | null> {
  try {
    await page.waitForTimeout(1200)
    const data = await page.evaluate(() => {
      const root = document.body

      const author =
        root.querySelector('[data-testid="story-subtitle"] a[role="link"]')?.textContent?.trim() ||
        root.querySelector('h3 a[role="link"], h4 a[role="link"]')?.textContent?.trim() ||
        'Desconhecido'

      const textCands = [
        root.querySelector('[data-ad-preview="message"]'),
        root.querySelector('[data-testid="post_message"]'),
        root.querySelector('[data-testid="story-subtitle"] + div'),
        root.querySelector('div[dir="auto"]')
      ].filter(Boolean) as Element[]
      let text = ''
      for (const t of textCands) {
        const s = (t.textContent || '').trim()
        if (s.length > text.length) text = s
      }

      const images = Array.from(root.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]'))
        .map(i => (i as HTMLImageElement).src)
        .filter(Boolean)
        .slice(0, 10)

      const timeEl = root.querySelector('abbr[title], time[title], [data-testid="story-subtitle"] a[role="link"] time[title]') as HTMLElement | null
      const timestamp = timeEl?.getAttribute('title') || timeEl?.textContent || new Date().toISOString()

      return { author, text, images, timestamp }
    })
    return data
  } catch (e: any) {
    console.error('[extractDataFromPostModal] erro:', e.message)
    return null
  }
}

export async function postClipBox(post: ElementHandle, page: Page) {
  try {
    const box = await post.boundingBox()
    return box
  } catch (e: any) {
    console.error('[postClipBox] Erro ao calcular clip box:', e.message)
    return null
  }
}

// Abre o post clicando no timestamp ou permalink. Funciona para modal ou navegação.
export async function openPostModalFromArticle(post: ElementHandle, page: Page): Promise<boolean> {
  try {
    await post.scrollIntoViewIfNeeded()

    await post.waitForSelector('a[role="link"] time[title], a[role="link"] abbr[title], a[href*="/permalink/"], a[href*="/posts/"]', { timeout: 3000 }).catch(() => {})

    const sels = [
      'a[role="link"] time[title]',
      'a[role="link"] abbr[title]',
      'a[href*="/permalink/"]',
      'a[href*="/posts/"]'
    ]

    let clicked = false
    for (const s of sels) {
      const a = await post.$(s)
      if (a) {
        await a.click({ button: 'left', delay: 20 })
        clicked = true
        break
      }
    }

    if (!clicked) {
      const meta = await extractMetaFromPost(post)
      if (meta?.url) {
        await page.goto(meta.url, { waitUntil: 'domcontentloaded' })
      } else {
        return false
      }
    }

    const opened = await Promise.race([
      page.waitForSelector('div[role="dialog"] [role="article"]', { timeout: 4000 }).then(() => true).catch(() => false),
      page.waitForURL('**/permalink/**', { timeout: 4000 }).then(() => true).catch(() => false),
      page.waitForSelector('[data-testid="story-subtitle"], [data-ad-preview="message"]', { timeout: 4000 }).then(() => true).catch(() => false)
    ])
    if (!opened) return false

    await page.waitForTimeout(600)
    return true
  } catch (e: any) {
    console.log('[openPostModalFromArticle] falha:', e.message)
    return false
  }
}

export async function closePostModal(page: Page): Promise<void> {
  const closeBtn = await page.$('div[aria-label="Fechar"], div[aria-label="Close"], [aria-label*="Close" i]')
  if (closeBtn) {
    await closeBtn.click({ delay: 10 })
    await page.waitForTimeout(200)
  } else {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
}

// Escuta respostas GraphQL para enriquecer com posts e comentários oficiais
export function attachGraphQLTap(page: Page, onChunk: (kind: 'posts' | 'comments', payload: any) => void) {
  page.on('response', async (res) => {
    try {
      const url = res.url()
      if (!url.includes('graphql')) return
      const text = await res.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      for (const line of lines) {
        try {
          const json = JSON.parse(line)
          const op = json?.extensions?.operationName || ''
          if (op.includes('GroupsCometFeedRegularStoriesPaginationQuery')) {
            onChunk('posts', json)
          } else if (op.includes('CometFocusedStoryViewUFIQuery')) {
            onChunk('comments', json)
          }
        } catch {}
      }
    } catch {}
  })
}