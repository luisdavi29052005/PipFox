
import { chromium, BrowserContext, Page, Locator } from 'playwright'
import { openContextForAccount } from '../../../src/core/automations/facebook/session/context'

// ===== Helpers =====
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

function extractPostId(href: string | null): string | null {
  if (!href) return null
  const m = href.match(/\/posts\/(\d+)/)
  return m ? m[1] : href
}

async function closePostModal(page: Page) {
  const dialog = page.locator('div[role="dialog"][aria-modal="true"]')
  await page.keyboard.press('Escape')
  try {
    await dialog.waitFor({ state: 'hidden', timeout: 6000 })
    return
  } catch {}
  const closeBtn = page.locator(
    [
      'div[role="dialog"][aria-modal="true"] [aria-label="Close"]',
      'div[role="dialog"][aria-modal="true"] [aria-label="Fechar"]',
      'div[role="dialog"][aria-modal="true"] [data-testid="modal-close-button"]',
    ].join(', '),
  )
  if (await closeBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await closeBtn.first().click().catch(()=>{})
    await dialog.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  }
}

// ===== Session/Login guard =====
async function ensureLoggedIn(page: Page, groupUrl: string) {
  // Tenta encontrar o feed primeiro, se já estiver logado
  try {
    await page.locator('div[role="feed"]').first().waitFor({ state: 'visible', timeout: 8000 })
    console.log('>> Login já ativo e feed visível.')
    return
  } catch {}

  // Lida com o banner de cookies se ele aparecer
  const cookieBtn = page.locator(
    'button:has-text("Allow all cookies"), button:has-text("Aceitar todos"), button:has-text("Aceitar tudo")',
  );
  if (await cookieBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await cookieBtn.first().click().catch(() => {});
  }

  // Detecta a tela de login
  const loginHints = page.locator(
    'form[action*="login"], input[name="email"], input[id="email"], div[role="dialog"] input[name="email"]',
  );
  
  if (await loginHints.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('>> Faça o login e clique em qualquer botão "Continuar" ou "Agora não" que aparecer. O script vai esperar...');
    
    // Espera a URL ser a do grupo
    await page.waitForURL(
        (url) => url.href.startsWith(groupUrl), 
        { timeout: 180000, waitUntil: 'domcontentloaded' }
    );

    // Espera o feed carregar
    await page.locator('div[role="feed"]').first().waitFor({ state: 'visible', timeout: 30000 });
    
    console.log('>> Login completo e feed carregado. Continuando a execução.');
    return;
  }

  // Verificação final
  await page.locator('div[role="feed"]').first().waitFor({ state: 'visible', timeout: 60000 });
}

// ===== Extract data from posts =====
export type PostData = {
  postId: string | null
  permalink: string | null
  authorName: string | null
  authorUrl: string | null
  timeISO: string | null
  timeText: string | null
  text: string | null
  imageUrls: string[]
}

async function parseModal(page: Page): Promise<PostData> {
  return await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"][aria-modal="true"]') as HTMLElement | null
    const pickText = (el: Element | null): string | null => {
      if (!el) return null
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const t = n.textContent?.trim() || ''
          return t.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        },
      })
      const parts: string[] = []
      while (walker.nextNode()) parts.push(walker.currentNode.textContent!.trim())
      const joined = parts.join(' ').replace(/\s+/g, ' ').trim()
      return joined || null
    }

    if (!dialog) {
      return { postId: null, permalink: null, authorName: null, authorUrl: null, timeISO: null, timeText: null, text: null, imageUrls: [] }
    }

    const article = dialog.querySelector('div[role="article"]') || dialog
    const tsA = dialog.querySelector('a[href*="/groups/"][href*="/posts/"]:has(time)') || dialog.querySelector('a:has(time)')
    const permalink = tsA instanceof HTMLAnchorElement ? tsA.href : null
    const timeEl = tsA?.querySelector('time') as HTMLElement | null
    const authorA = article.querySelector('h2 strong a, h3 strong a, a[aria-current="page"], a[role="link"][tabindex="0"]') as HTMLAnchorElement | null
    const textContainer = article.querySelector('[data-ad-preview="message"], div[dir="auto"], span[dir="auto"]') || article
    const imgEls = Array.from(article.querySelectorAll('img[src]')) as HTMLImageElement[]
    const images = Array.from(new Set(
      imgEls
        .map((i) => i.src)
        .filter((src) => src && !/static|emoji|profile|transparent/i.test(src))
        .slice(0, 12),
    ))

    const href = permalink || ''
    const m = href.match(/\/posts\/(\d+)/)

    return {
      postId: m ? m[1] : null,
      permalink,
      authorName: authorA?.innerText || null,
      authorUrl: authorA?.href || null,
      timeISO: timeEl?.getAttribute('datetime') || null,
      timeText: timeEl?.textContent?.trim() || null,
      text: pickText(textContainer),
      imageUrls: images,
    }
  })
}

export interface SelectorTestOptions {
  userId: string
  accountId: string
  groupUrl: string
  webhookUrl?: string
  headless?: boolean
  maxPosts?: number
  maxScrolls?: number
  pauseBetweenPostsMs?: [number, number]
}

/**
 * Testa os seletores usando a sessão oficial do projeto
 */
export async function testSelectors(options: SelectorTestOptions) {
  const {
    userId,
    accountId,
    groupUrl,
    webhookUrl = process.env.WEBHOOK_URL,
    headless = false,
    maxPosts = 25,
    maxScrolls = 120,
    pauseBetweenPostsMs = [700, 1400],
  } = options

  if (!groupUrl) throw new Error('groupUrl é obrigatória')

  console.log(`[selectorTester] Iniciando teste para grupo: ${groupUrl}`)
  console.log(`[selectorTester] Usando conta: ${accountId}`)

  // Usar o contexto oficial do projeto
  const context = await openContextForAccount(userId, accountId, headless)
  const page = await context.newPage()

  try {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded' })
    await ensureLoggedIn(page, groupUrl)

    const seen = new Set<string>()
    let processed = 0
    let scrolls = 0

    while (processed < maxPosts && scrolls < maxScrolls) {
      const articles = page.locator('div[role="feed"]').first().locator('div[role="article"]')
      const count = await articles.count()

      console.log(`[selectorTester] Encontrados ${count} articles na página`)

      let navigatedAway = false;

      for (let i = 0; i < count; i++) {
        if (processed >= maxPosts) break

        const post = articles.nth(i)
        
        const tsLink = post.locator('a[href*="/groups/"][href*="/posts/"]:has(time), a:has(time)').first()
        if (!(await tsLink.count())) continue

        const href = await tsLink.getAttribute('href')
        const postId = extractPostId(href)

        if (!postId || seen.has(postId)) {
          continue
        }
        
        console.log(`[selectorTester] Processando post ${processed + 1}/${maxPosts}: ${postId}`)

        const modalPromise = page.locator('div[role="dialog"][aria-modal="true"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => 'modal' as const).catch(() => null)
        const urlPromise = page.waitForURL(/\/posts\//, { timeout: 15000 }).then(() => 'page' as const).catch(() => null)
        await tsLink.click({ delay: rand(40, 120) }).catch(err => console.warn("Click failed, skipping post:", err.message));
        const mode = (await Promise.race([modalPromise, urlPromise])) || (page.url().includes('/posts/') ? 'page' : 'modal')

        seen.add(postId)

        try {
          const data = await parseModal(page)
          const payload = { ...data, postId: data.postId || postId, groupUrl }
          
          console.log(`[selectorTester] Dados extraídos:`, {
            postId: payload.postId,
            author: payload.authorName,
            textLength: payload.text?.length || 0,
            images: payload.imageUrls.length
          })

          if (webhookUrl) {
            try {
              await sendToWebhook(payload, webhookUrl)
              console.log(`[selectorTester] Dados enviados para webhook`)
            } catch (err) {
              console.warn(`[selectorTester] Erro no webhook para post ${payload.postId}:`, (err as Error).message)
            }
          }

          processed++
          
          if (mode === 'modal') {
            await closePostModal(page)
          } else {
            await page.goBack({ waitUntil: 'domcontentloaded' })
            await ensureLoggedIn(page, groupUrl)
            navigatedAway = true;
            break; 
          }
        } catch (e) {
          console.warn(`[selectorTester] Erro ao processar post ${postId}:`, e)
          if (!page.url().includes('/groups/')) {
            await page.goto(groupUrl, { waitUntil: 'domcontentloaded' }).catch(err => console.error('Failed to navigate back', err))
            await ensureLoggedIn(page, groupUrl)
            navigatedAway = true;
            break;
          }
        }
        await sleep(rand(...pauseBetweenPostsMs))
      }

      if (processed >= maxPosts) break
      if (navigatedAway) continue;

      scrolls++
      console.log(`[selectorTester] Scroll ${scrolls}/${maxScrolls}`)
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9)).catch(()=>{})
      await sleep(rand(900, 1600))
    }

    console.log(`[selectorTester] ✅ Finalizado. Posts processados: ${processed}, posts únicos encontrados: ${seen.size}`)
    
  } finally {
    await context.close()
  }
}

async function sendToWebhook(data: PostData & { groupUrl: string }, webhookUrl: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    })
    if (!res.ok) {
        const errorBody = await res.text().catch(() => 'N/A')
        throw new Error(`Webhook respondeu com status ${res.status}. Body: ${errorBody}`)
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Timeout: Webhook não respondeu em 15 segundos.')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}
