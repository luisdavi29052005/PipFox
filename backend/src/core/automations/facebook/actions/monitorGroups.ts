import { Page, ElementHandle } from 'playwright'
import path from 'path'
import fs from 'fs/promises'
import {
  findAllPosts,
  extractMetaFromPost,
  postClipBox
} from '../utils/facebook-post-selectors'
import { TokenBucket } from '../utils/rate-limiter'
import { generatePostHash, type PostMeta } from '../utils/dedupe'
/**
 * Função async generator que monitora um grupo do Facebook
 * e retorna dados de cada post encontrado.
 */
export async function* monitorGroup(page: Page, groupUrl: string) {
  const processedHashes = new Set<string>()
  let lastHeight = 0
  let sameHeightCount = 0

  console.log(`[monitorGroup] Acessando grupo: ${groupUrl}`)
  await page.goto(groupUrl, { waitUntil: 'networkidle' })

  while (true) {
    const posts = await findAllPosts(page)
    console.log(`[monitorGroup] Posts detectados: ${posts.length}`)

    for (const post of posts) {
      try {
        const meta = await extractMetaFromPost(post)
        if (!meta) continue

        const { author, text, imageUrl } = meta
        const contentHash = generatePostHash(author, text, imageUrl)

        if (processedHashes.has(contentHash)) continue
        processedHashes.add(contentHash)

        // Captura da screenshot do post
        const clip = await postClipBox(post)
        if (!clip) continue

        const screenshotPath = path.join(
          'screenshots',
          `${contentHash}.png`
        )
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
        await page.screenshot({ path: screenshotPath, clip })

        console.log(`[monitorGroup] Novo post encontrado: ${author} | Hash: ${contentHash}`)

        yield {
          author,
          text,
          imageUrl,
          screenshotPath,
          contentHash
        }
      } catch (err) {
        console.error(`[monitorGroup] Erro processando post:`, err)
      }
    }

    // Rolagem infinita controlada
    const currentHeight = await page.evaluate(() => document.body.scrollHeight)
    if (currentHeight === lastHeight) {
      sameHeightCount++
      if (sameHeightCount >= 3) {
        console.log('[monitorGroup] Nenhum novo conteúdo. Encerrando.')
        break
      }
    } else {
      sameHeightCount = 0
    }
    lastHeight = currentHeight

    await page.mouse.wheel(0, 800)
    await page.waitForTimeout(2000)
  }
}
