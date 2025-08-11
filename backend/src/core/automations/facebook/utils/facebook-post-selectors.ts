
// backend/src/core/automations/facebook/utils/facebook-post-selectors.ts
// Seletores otimizados baseados na análise real do Facebook (2025)

export const FEED = '[role="feed"]'

// Blocos a EXCLUIR (comentários, reels, etc.)
export const EXCLUDE = [
  '[aria-label*="Comment"]',
  '[aria-label*="Comentários"]',
  '[aria-label*="Comments"]',
  '[aria-label*="Responder"]',
  '[aria-label*="Write a comment"]',
  '[aria-label*="Escreva um comentário"]',
  '[data-visualcompletion="ignore-dynamic"] [role="article"]',
  '[data-pagelet*="Stories"]',
  '[aria-label*="Stories"]',
  '[aria-label*="Reels"]',
  'div[role="dialog"] *',
].join(', ')

// Delimitadores do post (rodapé/ações) - MAIS ESPECÍFICOS
export const ACTIONS = [
  '[role="toolbar"]',
  '[aria-label*="Actions for this post"]',
  '[aria-label*="Ações da publicação"]',
  'div[role="group"]:has(button[aria-label*="Like"], button[aria-label*="Curtir"])',
  'div:has(> div[role="button"]:has-text("Like"))',
  'div:has(> div[role="button"]:has-text("Curtir"))',
  'div:has(> div[role="button"]:has-text("Comentar"))',
  'div:has(> div[role="button"]:has-text("Comment"))',
  'div:has(> div[role="button"]:has-text("Compartilhar"))',
  'div:has(> div[role="button"]:has-text("Share"))',
].join(', ')

// Candidatos de container do POST - REFINADOS com base nas descobertas
export const POST_CONTAINERS: string[] = [
  // Prioridade ALTA - Posts com role="article" e aria-posinset
  `${FEED} > div [role="article"][aria-posinset]`,
  `${FEED} [role="article"][aria-posinset]`,
  
  // Prioridade MÉDIA - Posts com role="article" mas sem comentários
  `${FEED} [role="article"]:not(:has(${EXCLUDE}))`,
  
  // Fallbacks estruturais
  `${FEED} div:has(h3 a[aria-label][role="link"]):not(:has(${EXCLUDE}))`,
  `${FEED} div:has([data-ad-preview*="message"]):not(:has(${EXCLUDE}))`,
  `${FEED} div:has([data-ad-comet-preview]):not(:has(${EXCLUDE}))`,
]

// Seletores de AUTOR - OTIMIZADOS baseado na análise
export const AUTHOR: string[] = [
  // Prioridade ALTA - padrões que bateram nas 5 amostras
  'a[aria-label][role="link"]',
  'h3 a[aria-label][role="link"]',
  'h3 [role="link"]',
  
  // Fallbacks estruturais
  'a[role="link"][href*="/user/"]',
  'a[role="link"][href*="/people/"]',
  'a[role="link"][href*="/profile.php"]',
  'h3 strong a',
  'h3 b a',
]

// Seletores de TEXTO - OTIMIZADOS para Comet
export const TEXT: string[] = [
  // Prioridade ALTA - padrões Comet que bateram
  '[data-ad-preview*="message"]',
  '[data-ad-comet-preview]',
  
  // Fallbacks estruturais
  'div[dir] div:not(:has(a,img,video,svg,button))',
  'div[lang] div:not(:has(a,img,video,svg,button))',
  '[data-testid*="post_message"]',
]

// Seletores de IMAGEM - REFINADOS
export const IMAGES: string[] = [
  // Prioridade ALTA - padrões que funcionam
  'img[src*="fbcdn"]',
  'img[src*="scontent"]', 
  'img[src*="safe_image"]',
  
  // Estruturais
  'a[href*="photo"] img',
  'a[role="link"] img:not([src*="emoji"]):not([src*="static"]):not([src*="sprited"])',
]

// Seletores de PERMALINK
export const PERMALINK: string[] = [
  'a[href*="/posts/"]',
  'a[href*="/permalink/"]',
  'a[aria-label] abbr',
  '[data-testid*="story-subtitle"] a',
]

// Utilitários ---------------------------------------------------------------
export const pickFirst = async (root: any, selectors: string[]) => {
  for (const sel of selectors) {
    try {
      const loc = root.locator(sel)
      const count = await loc.count().catch(() => 0)
      if (count > 0) {
        const el = await loc.first().elementHandle().catch(() => null)
        if (el) return el
      }
    } catch (err) {
      // Continua para próximo seletor
    }
  }
  return null
}

export const findAllPosts = async (page: any) => {
  const results = []
  
  // Tentar cada estratégia de detecção
  for (const selector of POST_CONTAINERS) {
    try {
      let loc = page.locator(selector)
      
      // Filtro de visibilidade & exclusões
      loc = loc.filter({ hasNot: page.locator(EXCLUDE) })
      
      // Exigir barra de ações para ancorar o fim do post
      loc = loc.filter({ has: page.locator(ACTIONS) })
      
      const count = await loc.count()
      console.log(`[findAllPosts] Seletor "${selector}" encontrou ${count} posts`)
      
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const post = await loc.nth(i).elementHandle()
          if (post) results.push(post)
        }
        break // Se encontrou posts com este seletor, para aqui
      }
    } catch (err) {
      console.log(`[findAllPosts] Erro no seletor "${selector}":`, err.message)
    }
  }
  
  return results
}

export async function extractMetaFromPost(el: any) {
  // Extrair autor
  const authorEl = await pickFirst(el, AUTHOR)
  let author: string | undefined
  if (authorEl) {
    // Priorizar aria-label que funcionou nas amostras
    const aria = (await authorEl.getAttribute('aria-label')) || ''
    const txt = (await authorEl.textContent()) || ''
    author = (aria || txt).trim() || undefined
  }

  // Extrair texto (focar nos seletores Comet)
  let text = ''
  for (const sel of TEXT) {
    try {
      const blocks = el.locator(sel)
      const count = await blocks.count().catch(() => 0)
      if (count > 0) {
        for (let i = 0; i < Math.min(count, 3); i++) {
          const t = (await blocks.nth(i).innerText().catch(() => '')).trim()
          if (t && t.length > 10) {
            text += (text ? '\n\n' : '') + t
          }
        }
        if (text) break // Se encontrou texto, para
      }
    } catch (err) {
      // Continua para próximo seletor
    }
  }

  // Extrair imagem (evitar emoji/static/sprited)
  let imageUrl: string | undefined
  for (const sel of IMAGES) {
    try {
      const imgs = el.locator(sel)
      const n = await imgs.count().catch(() => 0)
      for (let i = 0; i < n; i++) {
        const src = await imgs.nth(i).getAttribute('src')
        if (!src) continue
        
        const low = src.toLowerCase()
        if (low.includes('emoji') || low.includes('static') || low.includes('sprited')) continue
        
        imageUrl = src
        break
      }
      if (imageUrl) break
    } catch (err) {
      // Continua
    }
  }

  // Extrair URL do post
  let url: string | undefined
  const permalinkEl = await pickFirst(el, PERMALINK)
  if (permalinkEl) {
    url = await permalinkEl.getAttribute('href')
  }

  return { 
    author, 
    text: text || undefined, 
    image: imageUrl, 
    url 
  }
}

// Screenshot do post (do topo até as ações)
export async function postClipBox(el: any, page?: any) {
  try {
    const postBox = await el.boundingBox()
    if (!postBox) return null
    
    const actions = await pickFirst(el, ACTIONS.split(', '))
    if (!actions) return postBox
    
    const actBox = await actions.boundingBox()
    if (!actBox) return postBox
    
    const height = Math.min(postBox.height, (actBox.y + actBox.height) - postBox.y)
    return { 
      x: postBox.x, 
      y: postBox.y, 
      width: postBox.width, 
      height 
    }
  } catch (err) {
    return null
  }
}
