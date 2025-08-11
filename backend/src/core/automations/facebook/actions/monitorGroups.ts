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

// Seletores específicos para posts principais (não comentários, reels ou popups)
const POST_SELECTOR = '[role="feed"] [role="article"][aria-posinset]:not([role="article"] [role="article"])'
const FEED_SELECTOR = '[role="feed"]'
const ACTION_BAR_SELECTOR = '[role="toolbar"], [aria-label*="Ações"], [aria-label*="Actions"], div[role="button"]:has(span:contains("Curtir")), div[role="button"]:has(span:contains("Like"))'

async function extractMeta(el: ElementHandle<Element>): Promise<PostMeta> {
    const meta = await el.evaluate((node) => {
    const within = (root: Element, sel: string) => root.querySelector(sel)
    
    // Verifica se é realmente um post principal (tem aria-posinset)
    const ariaPosInSet = node.getAttribute('aria-posinset')
    if (!ariaPosInSet) return {}
    
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
  
  try {
    await el.scrollIntoViewIfNeeded().catch(() => {})
    
    // Encontra a barra de ações dentro do post para delimitar o fim
    const actionBar = await el.locator(ACTION_BAR_SELECTOR).first().elementHandle().catch(() => null)
    
    if (actionBar) {
      // Calcula a área do post até a barra de ações
      const postBox = await el.boundingBox()
      const actionBox = await actionBar.boundingBox()
      
      if (postBox && actionBox) {
        // Corta até o final da barra de ações (não inclui comentários abaixo)
        const clipHeight = (actionBox.y + actionBox.height) - postBox.y
        
        await el.screenshot({ 
          path: file, 
          type: 'png',
          clip: {
            x: postBox.x,
            y: postBox.y,
            width: postBox.width,
            height: Math.min(clipHeight, postBox.height)
          }
        })
      } else {
        // Fallback: screenshot normal se não conseguir calcular as dimensões
        await el.screenshot({ path: file, type: 'png' })
      }
    } else {
      // Fallback: screenshot normal se não encontrar a barra de ações
      await el.screenshot({ path: file, type: 'png' })
    }
  } catch (error) {
    console.warn(`[screenshot] Erro ao capturar screenshot precisa, usando fallback:`, error)
    await el.screenshot({ path: file, type: 'png' })
  }
  
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

    // Processa um post por vez para maior precisão
    for (let i = 0; i < count; i++) {
      if (!running.has(workflowId)) break // Verifica parada a cada post
      
      const el = posts.nth(i)
      if (!(await el.isVisible().catch(() => false))) continue
      
      const handle = await el.elementHandle()
      if (!handle) continue
      
      // Verifica se tem aria-posinset (indicador de post principal)
      const ariaPosInSet = await handle.getAttribute('aria-posinset').catch(() => null)
      if (!ariaPosInSet) {
        console.log(`[monitor] ⏭️ Pulando elemento sem aria-posinset (provavelmente comentário ou popup)`)
        continue
      }
      
      const meta = await extractMeta(handle)
      
      // Valida se tem dados mínimos de um post
      if (!meta.url && !meta.author && !meta.text) {
        console.log(`[monitor] ⏭️ Pulando elemento sem dados válidos de post`)
        continue
      }
      
      const contentHash = generatePostHash(meta)
      if (seen.has(contentHash)) continue
      
      console.log(`[monitor] 📸 Processando post ${contentHash} de ${meta.author || 'desconhecido'}`)
      
      await limiter.consume(1)
      
      // Foca no post antes de fazer screenshot
      await handle.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(500) // Aguarda carregamento completo
      
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
      
      // Aguarda um pouco antes de processar o próximo post
      await page.waitForTimeout(1000 + Math.random() * 500)
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

    // Só rola a página depois de processar todos os posts visíveis
    console.log(`[monitor] 📜 Rolando página para carregar mais posts (processados: ${yielded})`)
    await page.mouse.wheel(0, 1000)
    await page.waitForTimeout(pollDelayMs)
  }
}