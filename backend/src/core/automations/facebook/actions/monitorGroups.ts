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

// Diretorio para salvar screenshots
const screenshotsDir = 'screenshots';

export interface MonitorGroupOptions {
  groupUrl: string
  workflowId: string
  running: Map<string, boolean>
}

/**
 * Função async generator que monitora um grupo do Facebook
 * e retorna dados de cada post encontrado. A nova lógica foca em abrir
 * o permalink para extrair dados do modal.
 */
export async function* monitorGroup(page: Page, options: MonitorGroupOptions) {
  const { groupUrl, workflowId, running } = options
  const processedHashes = new Set<string>()
  let lastHeight = 0
  let sameHeightCount = 0

  console.log(`[monitorGroup] Acessando grupo: ${groupUrl}`)
  await page.goto(groupUrl, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(5000) // Aguarda o carregamento inicial

  while (running.has(workflowId)) {
    const posts = await findAllPosts(page)
    console.log(`[monitorGroup] Posts detectados no feed: ${posts.length}`)

    for (const post of posts) {
      if (!running.has(workflowId)) break
      if (page.isClosed()) {
        console.log('[monitorGroup] ⚠️ Página foi fechada.')
        return
      }

      try {
        const meta = await extractMetaFromPost(post)
        if (!meta || !meta.url) continue

        const postMeta: PostMeta = {
          url: meta.url,
          author: meta.author || 'desconhecido',
          text: meta.text || '',
          timestamp: new Date().toISOString()
        }
        const contentHash = generatePostHash(postMeta)

        if (processedHashes.has(contentHash)) continue
        processedHashes.add(contentHash)

        // **Nova Lógica: Abrir post no modal para extração completa**
        console.log(`[monitorGroup] Abrindo post em modal: ${meta.url}`)
        await page.goto(meta.url, { waitUntil: 'domcontentloaded' })
        
        // **Aguardar o seletor do modal aparecer**
        // Este seletor deve ser robusto para a visualização de permalink
        await page.waitForSelector('div[role="dialog"]', { timeout: 15000 })
        
        // **Aqui entraria a nova função de extração do modal**
        // Por exemplo: const modalData = await extractDataFromModal(page);
        // Os dados extraídos (autor, texto, imagens, vídeos) seriam enviados ao n8n.
        
        // A lógica de screenshot e yield permanece para manter o fluxo atual,
        // mas seria substituída pela extração do modal.
        const clip = await postClipBox(post, page)
        if (!clip) continue;

        const screenshotPath = path.join(screenshotsDir, `${contentHash}.png`)
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
        await page.screenshot({ path: screenshotPath, clip, timeout: 15000 });

        console.log(`[monitorGroup] Novo post processado: ${postMeta.author} | Hash: ${contentHash}`)

        yield {
          ...postMeta,
          imageUrl: meta.image,
          screenshotPath,
          contentHash,
        }
        
        // Fechar o modal (ex: pressionando Escape ou clicando no botão de fechar)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000); // Dar tempo para a UI atualizar

      } catch (error) {
        console.log('[monitorGroup] ⚠️ Erro processando post:', error.message)
        if (page.isClosed() || error.message.includes('Target page, context or browser has been closed')) {
          return
        }
        // Voltar para a página do grupo para continuar o scan
        await page.goto(groupUrl, { waitUntil: 'load' });
      }
    }

    // Rolagem e controle de fim de feed
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

    try {
      await page.mouse.wheel(0, 800)
      await page.waitForTimeout(2000)
    } catch (scrollError) {
      if (page.isClosed()) break;
      console.error('[monitorGroup] Erro ao rolar a página:', scrollError.message);
      continue;
    }
  }

  console.log(`[monitorGroup] ✅ Monitoramento finalizado para workflow ${workflowId}`)
}