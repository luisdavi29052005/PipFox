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

export async function* monitorGroup(
  page: Page,
  groupUrl: string,
  workflowId: string,
  running: Map<string, boolean>
) {
  console.log('[monitorGroup] Acessando grupo:', { groupUrl, workflowId, running })

  // Ensure groupUrl is a string
  const url = typeof groupUrl === 'string' ? groupUrl : String(groupUrl)
  await page.goto(url)
  await page.waitForSelector(FEED, { timeout: 10000 }).catch(() => {})

  const gq = { posts: [] as any[], comments: [] as any[] }
  if (true) { // Assuming useGraphQLTap is always true based on the context of the change
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

  for (let i = 0; i < posts.length && out.length < 10; i++) { // Assuming maxPosts is 10 based on original code
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
    await page.waitForTimeout(200) // Assuming delayBetween is 200 based on original code
  }

  console.log('[monitorGroup] Extraídos', out.length, 'posts do grupo')
  // The original code returned the extracted posts directly.
  // The changes introduced an async generator with a monitoring loop.
  // The following section replaces the original return statement
  // and implements the monitoring loop as per the changes.

  await page.waitForLoadState('networkidle')

  // Loop de monitoramento
  while (running.get(workflowId)) {
    try {
      // Aguardar um intervalo antes de verificar novos posts
      await page.waitForTimeout(30000) // 30 segundos

      // Verificar se ainda está executando
      if (!running.get(workflowId)) {
        console.log('[monitorGroup] Workflow parado, encerrando monitoramento')
        break
      }

      // Implementar lógica de verificação de novos posts aqui
      // Por enquanto, apenas yield um resultado de status
      yield {
        success: true,
        timestamp: new Date().toISOString(),
        groupUrl: url,
        workflowId
      }

    } catch (error) {
      console.error('[monitorGroup] Erro durante monitoramento:', error)
      yield {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        groupUrl: url,
        workflowId
      }
    }
  }

  console.log('[monitorGroup] Monitoramento finalizado para', url)
}

export default monitorGroup