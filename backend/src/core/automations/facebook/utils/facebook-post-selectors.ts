
import { Page, ElementHandle } from 'playwright'

// Seletores mais simples e robustos
export const FEED = '[role="feed"]'

// Buscar posts usando articles como base
export async function findAllPosts(page: Page): Promise<ElementHandle[]> {
  try {
    // Aguardar o feed carregar
    await page.waitForSelector(FEED, { timeout: 10000 })
    
    console.log('[findAllPosts] Procurando articles no feed...')
    
    // Buscar todos os articles no feed
    const articles = await page.$$('article')
    
    console.log(`[findAllPosts] Encontrados ${articles.length} articles`)
    
    // Filtrar articles válidos (que têm conteúdo de post)
    const validArticles: ElementHandle[] = []
    
    for (const article of articles) {
      try {
        const isValidPost = await article.evaluate((el) => {
          // Verificar se tem autor
          const hasAuthor = el.querySelector('a[role="link"] strong, h3 a, h4 a')
          
          // Verificar se tem timestamp ou link do post
          const hasTime = el.querySelector('a[href*="/posts/"], a[href*="/permalink/"], time, abbr')
          
          // Verificar se não é story ou reel
          const isStory = el.closest('[data-pagelet*="Stories"]') || 
                         el.querySelector('[aria-label*="Stories"]') ||
                         el.querySelector('[aria-label*="Reels"]')
          
          // Verificar se não está em modal
          const isModal = el.closest('[role="dialog"]')
          
          return hasAuthor && hasTime && !isStory && !isModal
        })
        
        if (isValidPost) {
          validArticles.push(article)
        }
      } catch (e) {
        console.log('[findAllPosts] Erro ao validar article:', e)
      }
    }
    
    console.log(`[findAllPosts] ${validArticles.length} articles válidos encontrados`)
    return validArticles
    
  } catch (error: any) {
    console.error('[findAllPosts] Erro:', error.message)
    return []
  }
}

// Extrair metadados básicos do article
export async function extractMetaFromPost(article: ElementHandle): Promise<{ url?: string, author?: string, text?: string, image?: string } | null> {
  try {
    const meta = await article.evaluate((element) => {
      // Buscar autor dentro do article
      const authorSelectors = [
        'a[role="link"] strong',
        'h3 a[role="link"]',
        'h4 a[role="link"]',
        'strong a[role="link"]',
        'span strong a'
      ]
      
      let author = ''
      for (const selector of authorSelectors) {
        const authorEl = element.querySelector(selector)
        if (authorEl?.textContent?.trim()) {
          author = authorEl.textContent.trim()
          break
        }
      }
      
      // Buscar URL do post dentro do article
      const urlSelectors = [
        'a[href*="/posts/"]',
        'a[href*="/permalink/"]',
        'a[href*="/story.php"]',
        'time[title]',
        'abbr[title]'
      ]
      
      let url = ''
      for (const selector of urlSelectors) {
        const urlEl = element.querySelector(selector) as HTMLAnchorElement
        if (urlEl?.href && (urlEl.href.includes('/posts/') || urlEl.href.includes('/permalink/') || urlEl.href.includes('/story.php'))) {
          url = urlEl.href
          break
        }
        // Se for time/abbr, buscar o link pai
        if (urlEl && (selector.includes('time') || selector.includes('abbr'))) {
          const parentLink = urlEl.closest('a') as HTMLAnchorElement
          if (parentLink?.href) {
            url = parentLink.href
            break
          }
        }
      }
      
      // Buscar texto do post dentro do article
      const textSelectors = [
        '[data-ad-preview="message"]',
        '[data-testid="post_message"]',
        'div[dir="auto"][style*="text-align"]',
        'div[data-ad-comet-preview="message"]',
        'span[dir="auto"]'
      ]
      
      let text = ''
      let maxLength = 0
      for (const selector of textSelectors) {
        const textEls = element.querySelectorAll(selector)
        textEls.forEach(textEl => {
          const content = textEl.textContent?.trim()
          if (content && content.length > maxLength && content.length > 10) {
            text = content
            maxLength = content.length
          }
        })
      }
      
      // Buscar imagem dentro do article
      const imageEl = element.querySelector('img[src*="scontent"], img[src*="fbcdn"]') as HTMLImageElement
      const image = imageEl?.src || ''
      
      // Gerar ID único baseado no conteúdo se não tiver URL
      let postId = url
      if (!postId && (author || text)) {
        postId = `generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
      
      return {
        author: author || undefined,
        url: postId || undefined,
        text: text || undefined,
        image: image || undefined
      }
    })
    
    return meta
  } catch (error: any) {
    console.error('[extractMetaFromPost] Erro:', error.message)
    return null
  }
}

// Abrir post de forma mais robusta para articles
export async function openPostModalFromArticle(article: ElementHandle, page: Page): Promise<boolean> {
  try {
    await article.scrollIntoViewIfNeeded()
    
    // Tentar diferentes estratégias para abrir o post do article
    const strategies = [
      // Estratégia 1: Clicar no timestamp/time element
      async () => {
        const timeElements = await article.$$('time, abbr[title]')
        for (const timeEl of timeElements) {
          try {
            // Buscar link pai do time element
            const parentLink = await timeEl.evaluateHandle(el => el.closest('a'))
            if (parentLink) {
              await parentLink.click()
              return true
            }
            // Se não tem link pai, tentar clicar no próprio time
            await timeEl.click()
            return true
          } catch (e) {
            continue
          }
        }
        return false
      },
      
      // Estratégia 2: Clicar diretamente no link do post
      async () => {
        const postLinks = await article.$$('a[href*="/posts/"], a[href*="/permalink/"], a[href*="/story.php"]')
        for (const link of postLinks) {
          try {
            await link.click()
            return true
          } catch (e) {
            continue
          }
        }
        return false
      },
      
      // Estratégia 3: Clicar no botão de comentários
      async () => {
        const commentSelectors = [
          '[aria-label*="Comment"]',
          '[aria-label*="Comentar"]',
          '[aria-label*="comment"]',
          'div[role="button"]:has-text("Comment")',
          'div[role="button"]:has-text("Comentar")'
        ]
        
        for (const selector of commentSelectors) {
          try {
            const commentBtn = await article.$(selector)
            if (commentBtn) {
              await commentBtn.click()
              return true
            }
          } catch (e) {
            continue
          }
        }
        return false
      },
      
      // Estratégia 4: Clicar no article todo (fallback)
      async () => {
        await article.click()
        return true
      }
    ]
    
    // Tentar cada estratégia
    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`[openPostModalFromArticle] Tentando estratégia ${i + 1}`)
        const success = await strategies[i]()
        if (success) {
          // Aguardar modal, nova página ou mudança de URL
          await Promise.race([
            page.waitForSelector('[role="dialog"]', { timeout: 3000 }),
            page.waitForURL('**/posts/**', { timeout: 3000 }),
            page.waitForURL('**/permalink/**', { timeout: 3000 }),
            page.waitForURL('**/story.php**', { timeout: 3000 }),
            page.waitForTimeout(2000) // Fallback timeout
          ]).catch(() => {})
          
          console.log(`[openPostModalFromArticle] Estratégia ${i + 1} funcionou`)
          return true
        }
      } catch (e) {
        console.log(`[openPostModalFromArticle] Estratégia ${i + 1} falhou:`, e)
        continue
      }
    }
    
    return false
  } catch (error: any) {
    console.error('[openPostModalFromArticle] Erro:', error.message)
    return false
  }
}

// Extrair dados completos do modal/página do post
export async function extractDataFromPostModal(page: Page): Promise<{ author: string, text: string, images: string[], timestamp: string } | null> {
  try {
    await page.waitForTimeout(1000)
    
    const data = await page.evaluate(() => {
      // Buscar autor
      let author = ''
      const authorSelectors = [
        'h3 a[role="link"]',
        'h4 a[role="link"]',
        '[data-testid="story-subtitle"] a[role="link"]',
        'strong a[role="link"]'
      ]
      
      for (const selector of authorSelectors) {
        const authorEl = document.querySelector(selector)
        if (authorEl?.textContent?.trim()) {
          author = authorEl.textContent.trim()
          break
        }
      }
      
      // Buscar texto
      let text = ''
      const textSelectors = [
        '[data-ad-preview="message"]',
        '[data-testid="post_message"]',
        'div[dir="auto"]'
      ]
      
      for (const selector of textSelectors) {
        const textEl = document.querySelector(selector)
        if (textEl?.textContent?.trim()) {
          const content = textEl.textContent.trim()
          if (content.length > text.length) {
            text = content
          }
        }
      }
      
      // Buscar imagens
      const images = Array.from(document.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]'))
        .map(img => (img as HTMLImageElement).src)
        .filter(src => src && !src.includes('emoji'))
        .slice(0, 5)
      
      // Buscar timestamp
      let timestamp = new Date().toISOString()
      const timeSelectors = [
        'time[title]',
        'abbr[title]',
        '[data-testid="story-subtitle"] time'
      ]
      
      for (const selector of timeSelectors) {
        const timeEl = document.querySelector(selector)
        if (timeEl) {
          const title = timeEl.getAttribute('title')
          const textContent = timeEl.textContent
          if (title) {
            timestamp = title
            break
          } else if (textContent?.trim()) {
            timestamp = textContent.trim()
            break
          }
        }
      }
      
      return {
        author: author || 'Desconhecido',
        text: text || '',
        images: images || [],
        timestamp
      }
    })
    
    return data
  } catch (error: any) {
    console.error('[extractDataFromPostModal] Erro:', error.message)
    return null
  }
}

// Fechar modal
export async function closePostModal(page: Page): Promise<void> {
  try {
    // Tentar diferentes formas de fechar
    const closeSelectors = [
      '[aria-label="Close"]',
      '[aria-label="Fechar"]',
      '[data-testid="modal-close-button"]'
    ]
    
    for (const selector of closeSelectors) {
      const closeBtn = await page.$(selector)
      if (closeBtn) {
        await closeBtn.click()
        await page.waitForTimeout(500)
        return
      }
    }
    
    // Fallback: ESC
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  } catch (error) {
    console.log('[closePostModal] Erro ao fechar modal:', error)
  }
}

export async function postClipBox(post: ElementHandle, page: Page) {
  try {
    return await post.boundingBox()
  } catch (error: any) {
    console.error('[postClipBox] Erro:', error.message)
    return null
  }
}

// Função placeholder para compatibilidade
export async function clickPostTimestamp(post: ElementHandle): Promise<boolean> {
  return false
}

// Função placeholder para compatibilidade  
export function attachGraphQLTap(page: Page, onChunk: (kind: 'posts' | 'comments', payload: any) => void) {
  // Implementação simplificada - pode ser expandida depois
}
