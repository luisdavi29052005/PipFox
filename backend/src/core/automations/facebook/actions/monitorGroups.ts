// Local: backend/src/fb_bot/actions/monitorGroups.ts

import { Page, ElementHandle } from 'playwright'
import path from 'path'
import fs from 'fs/promises'
import { TokenBucket } from '../utils/rate-limiter'
import { generatePostHash, type PostMeta } from '../utils/dedupe'

export interface DiscoveredPost {
  element: ElementHandle<Element>
  url?: string
  author?: string
  text?: string
  timestamp?: string
  contentHash: string
  screenshotPath: string
}

export interface MonitorOptions {
  groupUrl: string
  workflowId: string            // Adicionado
  running: Map<string, boolean> // Adicionado
  screenshotDir?: string
  pollDelayMs?: number
  maxEmptyCycles?: number
  rateLimiter?: TokenBucket
}

const POST_SELECTOR = '[role="feed"] [role="article"]:not([role="article"] [role="article"])'
const FEED_SELECTOR = '[role="feed"]'

async function extractMeta(el: ElementHandle<Element>): Promise<PostMeta> {
    const meta = await el.evaluate((node) => {
    const within = (root: Element, sel: string) => root.querySelector(sel)
    const linkEl = (within(node, 'a[href*="/posts/"]') || within(node, 'a[href*="/permalink/"]')) as HTMLAnchorElement | null
    const url = linkEl?.href || undefined
    const author = (within(node, '[role="link"][tabindex]')?.textContent || undefined)?.trim()
    const textBlocks = Array.from(node.querySelectorAll('[data-ad-preview*="message"], [data-ad-comet-preview]')) as HTMLElement[]
    const text = textBlocks.map(n => n.innerText).join('\n').trim() || undefined
    const timeEl = within(node, 'a[aria-label][href*="/posts/"] abbr, a time, abbr[title]') as HTMLElement | null
    const timestamp = timeEl?.getAttribute('title') || undefined
    return { url, author, text, timestamp }
  }).catch(() => ({}))
  return meta
}

async function screenshotPost(el: ElementHandle<Element>, dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `post_${Date.now()}.png`)
  await el.scrollIntoViewIfNeeded().catch(() => {})
  await el.screenshot({ path: file, type: 'png' })
  return file
}

export async function* monitorGroup(page: Page, opts: MonitorOptions): AsyncGenerator<DiscoveredPost> {
  const { groupUrl, workflowId, running, screenshotDir = path.resolve('screenshots/facebook'), pollDelayMs = 2_000, maxEmptyCycles = 10 } = opts
  const limiter = opts.rateLimiter ?? new TokenBucket(10, 5, 60)

  console.log('[monitor] Navegando para o grupo e aguardando o feed...');
  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(FEED_SELECTOR, { timeout: 60000 });
  console.log('[monitor] Feed do grupo carregado.');

  let emptyCycles = 0
  const seen = new Set<string>()

  while (true) {
    // *** VERIFICAÇÃO DE PARADA DENTRO DO LOOP PRINCIPAL ***
    if (!running.has(workflowId)) {
      console.log(`[monitor] Sinal de parada recebido para o workflow ${workflowId}. Encerrando monitoramento.`);
      break; // Sai do loop 'while (true)'
    }

    const posts = page.locator(POST_SELECTOR)
    const count = await posts.count()
    let yielded = 0

    for (let i = 0; i < count; i++) {
      const el = posts.nth(i)
      if (!(await el.isVisible().catch(() => false))) continue
      const handle = await el.elementHandle()
      if (!handle) continue
      const meta = await extractMeta(handle)
      const contentHash = generatePostHash(meta)
      if (seen.has(contentHash)) continue
      await limiter.consume(1)
      const shot = await screenshotPost(handle, screenshotDir)
      seen.add(contentHash)
      yielded++
      yield { element: handle, url: meta.url, author: meta.author, text: meta.text, timestamp: meta.timestamp, contentHash: contentHash, screenshotPath: shot }
      await page.waitForTimeout(800 + Math.random() * 400)
    }

    if (yielded === 0) {
      emptyCycles++
      if (emptyCycles >= maxEmptyCycles) {
          console.log(`[monitor] ${maxEmptyCycles} ciclos sem posts novos. Encerrando monitoramento para este grupo.`);
          break;
      }
    } else {
      emptyCycles = 0
    }

    await page.mouse.wheel(0, 1000)
    await page.waitForTimeout(pollDelayMs)
  }
}