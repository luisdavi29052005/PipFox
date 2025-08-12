import { Page } from 'playwright'
import {
  FEED,
  findAllPosts,
  extractMetaFromPost,
  extractDataFromPostModal,
  openPostModalFromArticle,
  closePostModal,
  attachGraphQLTap
} from '../utils/facebook-post-selectors'

export type MonitorOptions = {
  maxPosts?: number
  delayBetween?: number
  useGraphQLTap?: boolean
}

export type ExtractedPost = {
  url: string | null
  author: string
  text: string
  images: string[]
  timestamp: string
  extractedFromModal: boolean
}

export async function monitorGroup(page: Page, groupUrl: string, options: MonitorOptions = {}): Promise<ExtractedPost[]> {
  const maxPosts = options.maxPosts ?? 10
  const delayBetween = options.delayBetween ?? 200
  console.log('[monitorGroup] Acessando grupo:', groupUrl)

  await page.goto(groupUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(FEED, { timeout: 10000 }).catch(() => {})

  const gq = { posts: [] as any[], comments: [] as any[] }
  if (options.useGraphQLTap) {
    attachGraphQLTap(page, (kind, payload) => {
      if (kind === 'posts') gq.posts.push(payload)
      if (kind === 'comments') gq.comments.push(payload?.data)
    })
  }

  let posts = await findAllPosts(page)
  console.log('[monitorGroup] Posts detectados no feed:', posts.length)

  // Se nada apareceu, tenta um scroll suave e reavalia
  if (posts.length === 0) {
    await page.evaluate(() => window.scrollBy(0, 800))
    await page.waitForTimeout(800)
    posts = await findAllPosts(page)
    console.log('[monitorGroup] Segunda varredura, posts:', posts.length)
  }

  const out: ExtractedPost[] = []

  for (let i = 0; i < posts.length && out.length < maxPosts; i++) {
    const post = posts[i]
    console.log(`[monitorGroup] Abrindo post ${i + 1}/${posts.length}`)

    const opened = await openPostModalFromArticle(post, page)
    if (!opened) {
      console.log('[monitorGroup] não consegui abrir, pulando')
      continue
    }

    const detailed = await extractDataFromPostModal(page)
    if (!detailed) {
      console.log('[monitorGroup] falhou extração detalhada, fechando e pulando')
      await closePostModal(page)
      continue
    }

    const meta = await extractMetaFromPost(post)

    out.push({
      url: meta?.url || null,
      author: detailed.author || meta?.author || 'desconhecido',
      text: detailed.text || meta?.text || '',
      images: detailed.images || [],
      timestamp: detailed.timestamp,
      extractedFromModal: true
    })

    await closePostModal(page)
    await page.waitForTimeout(delayBetween)
  }

  console.log('[monitorGroup] Extraídos', out.length, 'posts do grupo')
  return out
}

export default monitorGroup
