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
 * e retorna dados de cada post encontrado.
 */
export async function* monitorGroup(page: Page, options: MonitorGroupOptions) {
  const { groupUrl, workflowId, running } = options
  const processedHashes = new Set<string>()
  let lastHeight = 0
  let sameHeightCount = 0

  console.log(`[monitorGroup] Acessando grupo: ${groupUrl}`)

  // Aumentar timeout e usar 'load' ao invés de 'networkidle'
  await page.goto(groupUrl, { waitUntil: 'load', timeout: 60000 })

  // Aguardar um pouco para o feed carregar
  await page.waitForTimeout(3000)

  while (running.has(workflowId)) {
    const posts = await findAllPosts(page)
    console.log(`[monitorGroup] Posts detectados: ${posts.length}`)

    for (const post of posts) {
      if (!running.has(workflowId)) break

      try {
        // Verificar se a página ainda está ativa antes de processar
        if (page.isClosed()) {
          console.log('[monitorGroup] ⚠️ Página foi fechada, pulando processamento do post')
          continue
        }

        // Aguardar um pouco para o post carregar completamente
        await page.waitForTimeout(1000)

        const meta = await extractMetaFromPost(post)
        if (!meta) continue

        const { author, text, image, url } = meta
        const postMeta: PostMeta = {
          url: url || groupUrl,
          author: author || 'desconhecido',
          text: text || '',
          timestamp: new Date().toISOString()
        }
        const contentHash = generatePostHash(postMeta)

        if (processedHashes.has(contentHash)) continue
        processedHashes.add(contentHash)

        // Captura da screenshot do post
        const clip = await postClipBox(post, page)
        if (!clip) {
          console.log(`[monitorGroup] ⚠️ Não foi possível obter o clip do post. Pulando screenshot.`);
          continue;
        }

        const screenshotPath = path.join(
          screenshotsDir,
          `${contentHash}.png`
        )
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true })

        try {
          await page.screenshot({ path: screenshotPath, clip, timeout: 15000 }); // Timeout de 15 segundos para screenshot
        } catch (screenshotError) {
          console.error(`[monitorGroup] Erro ao tirar screenshot do post ${contentHash}:`, screenshotError.message);
          // Se o erro for relacionado à área vazia, podemos tentar um fallback
          if (screenshotError.message.includes('Clipped area is either empty or outside the resulting image')) {
            console.log(`[monitorGroup] ⚠️ Erro de screenshot: Clipped area is either empty or outside the resulting image. Tentando screenshot da página inteira.`);
            try {
              await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 15000 });
            } catch (fallbackError) {
              console.error(`[monitorGroup] Erro no fallback de screenshot:`, fallbackError.message);
              continue; // Pula para o próximo post se o fallback falhar
            }
          } else {
            continue; // Pula para o próximo post se for outro erro de screenshot
          }
        }

        console.log(`[monitorGroup] Novo post encontrado: ${author} | Hash: ${contentHash}`)

        yield {
          author: postMeta.author,
          text: postMeta.text,
          imageUrl: image,
          screenshotPath,
          contentHash,
          url: postMeta.url
        }
      } catch (error) {
        console.log('[monitorGroup] ⚠️ Erro processando post:', error.message)

        // Se a página foi fechada, interromper o loop
        if (error.message.includes('Target page, context or browser has been closed') ||
            error.message.includes('page.isClosed')) {
          console.log('[monitorGroup] 🛑 Página fechada, encerrando monitoramento')
          break
        }

        // Para outros erros, apenas pular este post
        continue
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

    // Tentar rolar a página, com timeout
    try {
      await page.mouse.wheel(0, 800)
      await page.waitForTimeout(2000)
    } catch (scrollError) {
      console.error('[monitorGroup] Erro ao rolar a página:', scrollError.message);
      if (scrollError.message.includes('Target page, context or browser has been closed')) {
        console.log('[monitorGroup] 🛑 Página fechada durante a rolagem, encerrando monitoramento')
        break;
      }
      // Se houver erro ao rolar, tenta continuar com os posts existentes ou encerra se não houver mais posts
      continue;
    }
  }

  console.log(`[monitorGroup] ✅ Monitoramento finalizado para workflow ${workflowId}`)
}

// Mock functions for compilation, assuming they are defined elsewhere
// In a real scenario, these would be imported from '../utils/facebook-post-selectors'
async function extractPostText(page: Page, postElement: ElementHandle): Promise<string | null> {
  // Placeholder implementation
  return `Text from ${await postElement.evaluate(el => el.querySelector('h3')?.textContent || 'unknown author')}`;
}

async function extractAuthorName(page: Page, postElement: ElementHandle): Promise<string | null> {
  // Placeholder implementation
  return await postElement.evaluate(el => el.querySelector('h3 a')?.textContent || 'unknown');
}

async function extractPostUrl(page: Page, postElement: ElementHandle): Promise<string | null> {
  // Placeholder implementation
  const linkElement = await postElement.querySelector('h3 a');
  return linkElement ? await linkElement.evaluate(node => (node as HTMLAnchorElement).href) : null;
}

// Placeholder for EXCLUDE_SELECTOR and ACTIONS_SELECTOR if they are not defined globally
const EXCLUDE_SELECTOR = 'div[data-ad-comet-preview="message"]';
const ACTIONS_SELECTOR = 'div[role="button"][aria-label="Ações"]';

// Mock function for takePostScreenshot if it's not defined in the provided snippet
async function takePostScreenshot(page: Page, postElement: ElementHandle): Promise<string> {
  const filename = `post_${Date.now()}.png`;
  const fullPath = path.join(screenshotsDir, filename);

  try {
    // Verificar se o elemento está visível e tem dimensões
    const boundingBox = await postElement.boundingBox();

    if (!boundingBox || boundingBox.width <= 0 || boundingBox.height <= 0) {
      console.log('[screenshot] ⚠️ Elemento não tem dimensões válidas, usando screenshot da página');
      await page.screenshot({ path: fullPath, fullPage: false });
      return fullPath;
    }

    // Garantir que o elemento esteja na viewport
    await postElement.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500); // Aguardar renderização

    // Tentar screenshot do elemento específico
    await postElement.screenshot({
      path: fullPath,
      timeout: 10000 // 10 segundos de timeout
    });

    return fullPath;
  } catch (error) {
    console.log('[screenshot] ⚠️ Erro no screenshot do elemento, tentando screenshot da área visível:', error.message);

    try {
      // Fallback: screenshot da viewport atual
      await page.screenshot({
        path: fullPath,
        fullPage: false,
        clip: { x: 0, y: 0, width: 1200, height: 800 }
      });
      return fullPath;
    } catch (fallbackError) {
      console.log('[screenshot] ❌ Erro no fallback do screenshot:', fallbackError.message);
      throw fallbackError;
    }
  }
}

// Mock function for findAllPosts if it's not defined in the provided snippet
async function findAllPosts(page: Page): Promise<any[]> {
  const POST_CONTAINERS = [
    // Seletores mais específicos primeiro (com aria-posinset)
    '[role="feed"] > div [role="article"][aria-posinset]',
    '[role="feed"] [role="article"][aria-posinset]',

    // Seletor principal com exclusões
    `[role="feed"] [role="article"]:not(:has(${EXCLUDE_SELECTOR}))`,

    // Seletores alternativos
    `[role="feed"] div:has(h3 a[aria-label][role="link"]):not(:has(${EXCLUDE_SELECTOR}))`,
    `[role="feed"] div:has([data-ad-preview*="message"]):not(:has(${EXCLUDE_SELECTOR}))`,
    `[role="feed"] div:has([data-ad-comet-preview]):not(:has(${EXCLUDE_SELECTOR}))`,
  ]

  for (const selector of POST_CONTAINERS) {
    try {
      const count = await page.locator(selector).count()
      console.log(`[findAllPosts] Seletor "${selector}" encontrou ${count} posts`)

      if (count > 0) {
        const posts: ElementHandle[] = []

        // Limitar a 5 posts para evitar timeout
        const maxPosts = Math.min(count, 5)

        // Coletar posts como Locators para usar a API moderna do Playwright
        for (let i = 0; i < maxPosts; i++) {
          try {
            const postLocator = page.locator(selector).nth(i)
            const isVisible = await postLocator.isVisible({ timeout: 3000 })
            if (isVisible) {
              posts.push(postLocator)
              console.log(`[findAllPosts] ✅ Post ${i} coletado com sucesso`)
            }
          } catch (error) {
            console.log(`[findAllPosts] ⚠️ Erro ao coletar post ${i}:`, error.message)
            continue
          }
        }

        if (posts.length > 0) {
          console.log(`[findAllPosts] 🎯 Retornando ${posts.length} posts para processamento`)
          return posts
        }
      }
    } catch (error) {
      if (error.message.includes('Target page, context or browser has been closed')) {
        console.log('[findAllPosts] 🛑 Browser fechado durante busca')
        return []
      }
      console.log(`[findAllPosts] Erro no seletor "${selector}":`, error.message)
    }
  }

  return []
}