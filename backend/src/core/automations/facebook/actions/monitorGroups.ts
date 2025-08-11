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
  screenshotDir?: string
  pollDelayMs?: number
  maxEmptyCycles?: number
  rateLimiter?: TokenBucket
}

/** Seletores robustos para isolar posts de primeiro nível do feed */
const POST_SELECTOR = '[role="feed"] [role="article"]:not([role="article"] [role="article"])'

async function extractMeta(el: ElementHandle<Element>): Promise<PostMeta> {
  const meta = await el.evaluate(() => {
    const within = (root: Element, sel: string) => root.querySelector(sel)

    const linkEl = (within(document as any as Element, 'a[href*="/posts/"]') || within(document as any as Element, 'a[href*="/permalink/"]')) as HTMLAnchorElement | null
    const url = linkEl?.href || undefined

    const author = (within(document as any as Element, '[role="link"][tabindex]')?.textContent || undefined)?.trim()

    const textBlocks = Array.from((document as any as Element).querySelectorAll('[data-ad-preview*="message"], [data-ad-comet-preview]')) as HTMLElement[]
    const text = textBlocks.map(n => n.innerText).join('\n').trim() || undefined

    const timeEl = within(document as any as Element, 'a[aria-label][href*="/posts/"] abbr, a time, abbr[title]') as HTMLElement | null
    const timestamp = timeEl?.getAttribute('title') || undefined

    return { url, author, text, timestamp }
  }).catch(() => ({ }))

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
  const { groupUrl, screenshotDir = path.resolve('screenshots/facebook'), pollDelayMs = 2_000, maxEmptyCycles = 10 } = opts
  const limiter = opts.rateLimiter ?? new TokenBucket(10, 5, 60)

  await page.goto(groupUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')

  let emptyCycles = 0
  const seen = new Set<string>()

  while (true) {
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

      // Rate limit por post
      await limiter.consume(1)

      const shot = await screenshotPost(handle, screenshotDir)

      seen.add(contentHash)
      yielded++

      yield {
        element: handle,
        url: meta.url,
        author: meta.author,
        text: meta.text,
        timestamp: meta.timestamp,
        contentHash: contentHash,
        screenshotPath: shot
      }

      // Respiro entre posts
      await page.waitForTimeout(800 + Math.random() * 400)
    }

    if (yielded === 0) {
      emptyCycles++
      if (emptyCycles >= maxEmptyCycles) emptyCycles = 0
    } else {
      emptyCycles = 0
    }

    // Scroll para carregar novos
    await page.mouse.wheel(0, 1000)
    await page.waitForTimeout(pollDelayMs)
  }
}