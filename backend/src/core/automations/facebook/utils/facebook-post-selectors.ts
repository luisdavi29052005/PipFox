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
      const el = await root.querySelector(sel)
      if (el) return el
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
  console.log('[extractMeta] Iniciando extração de metadados do post...')

  // Extrair autor usando Playwright Locator API
  let author: string | undefined
  const authorSelectors = [
    'h3 a[role="link"]',
    'h4 a[role="link"]', 
    'a[role="link"] strong',
    'a[role="link"]',
    '[role="heading"] a',
    'strong a',
    'h3 a',
    'h4 a',
    'a[href*="user"]',
    'a[href*="profile"]'
  ]

  for (const sel of authorSelectors) {
    try {
      const authorLoc = el.locator(sel).first()
      const count = await authorLoc.count()
      if (count > 0) {
        const aria = await authorLoc.getAttribute('aria-label').catch(() => '')
        const txt = await authorLoc.textContent().catch(() => '')
        author = (aria || txt || '').trim() || undefined
        if (author) {
          console.log(`[extractMeta] ✅ Autor encontrado com seletor "${sel}": ${author}`)
          break
        }
      }
    } catch (err) {
      console.log(`[extractMeta] Erro no seletor de autor "${sel}":`, err.message)
    }
  }

  if (!author) {
    console.log('[extractMeta] ⚠️ Nenhum autor encontrado, tentando seletores alternativos...')
  }

  // Extrair texto usando Playwright Locator API
  let text = ''
  const textSelectors = [
    '[data-ad-preview="message"]',
    '[data-ad-comet-preview="message"]',
    'div[dir="auto"]',
    'p',
    'span[dir="auto"]',
    'div[lang]',
    'span[lang]'
  ]

  for (const sel of textSelectors) {
    try {
      const blocks = el.locator(sel)
      const count = await blocks.count()
      console.log(`[extractMeta] Seletor de texto "${sel}" encontrou ${count} elementos`)

      if (count > 0) {
        const maxBlocks = Math.min(count, 3)
        for (let i = 0; i < maxBlocks; i++) {
          const t = await blocks.nth(i).textContent().catch(() => '') || ''
          const trimmed = t.trim()
          if (trimmed && trimmed.length > 5 && 
              !trimmed.includes('http') && 
              !trimmed.match(/^\d+$/) && 
              !trimmed.match(/^(Like|Curtir|Comment|Comentar|Share|Compartilhar)$/i)) {
            text += (text ? '\n\n' : '') + trimmed
            console.log(`[extractMeta] ✅ Texto encontrado: "${trimmed.substring(0, 50)}..."`)
          }
        }
        if (text) break // Se encontrou texto, para
      }
    } catch (err) {
      console.log(`[extractMeta] Erro no seletor de texto "${sel}":`, err.message)
    }
  }

  if (!text) {
    console.log('[extractMeta] ⚠️ Nenhum texto encontrado')
  }

  // Extrair imagem usando Playwright Locator API
  let imageUrl: string | undefined
  const imageSelectors = [
    'img[src*="fbcdn"]',
    'img[src*="scontent"]', 
    'img[src*="safe_image"]',
    'a[href*="photo"] img',
    'img:not([src*="emoji"]):not([src*="static"]):not([src*="sprited"])'
  ]

  for (const sel of imageSelectors) {
    try {
      const imgs = el.locator(sel)
      const count = await imgs.count()
      for (let i = 0; i < count; i++) {
        const src = await imgs.nth(i).getAttribute('src').catch(() => null)
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

  // Extrair URL do post usando Playwright Locator API
  let url: string | undefined
  const permalinkSelectors = [
    'a[href*="/posts/"]',
    'a[href*="/permalink/"]',
    '[data-testid*="story-subtitle"] a'
  ]
  
  for (const sel of permalinkSelectors) {
    try {
      const linkLoc = el.locator(sel).first()
      const count = await linkLoc.count()
      if (count > 0) {
        url = await linkLoc.getAttribute('href').catch(() => null)
        if (url) break
      }
    } catch (err) {
      // Continua
    }
  }

  const result = { 
    author, 
    text: text || undefined, 
    image: imageUrl,
    url
  }

  console.log('[extractMeta] Resultado final:', {
    author: author || 'NÃO ENCONTRADO',
    textLength: text?.length || 0,
    hasImage: !!imageUrl,
    hasUrl: !!url
  })

  return result
}

// Screenshot do post (do topo até as ações)
export async function postClipBox(el: any, page?: any) {
  try {
    // Se el é um Locator, precisamos obter o ElementHandle primeiro
    let element = el
    if (el.boundingBox === undefined && el.elementHandle) {
      element = await el.elementHandle()
    }
    
    const postBox = await element.boundingBox()
    if (!postBox) {
      console.log('[postClipBox] ⚠️ Não foi possível obter boundingBox do post')
      return null
    }

    // Verificar se o post tem dimensões válidas
    if (postBox.width <= 0 || postBox.height <= 0) {
      console.log('[postClipBox] ⚠️ Post tem dimensões inválidas:', postBox)
      return null
    }

    // Garantir que as coordenadas estão dentro da viewport
    if (page) {
      const viewport = page.viewportSize()
      if (viewport && (postBox.x < 0 || postBox.y < 0 || 
          postBox.x + postBox.width > viewport.width || 
          postBox.y + postBox.height > viewport.height)) {
        console.log('[postClipBox] ⚠️ Post está fora da viewport, ajustando...')
        // Ajustar as coordenadas para ficar dentro da viewport
        const adjustedBox = {
          x: Math.max(0, postBox.x),
          y: Math.max(0, postBox.y),
          width: Math.min(postBox.width, viewport.width - Math.max(0, postBox.x)),
          height: Math.min(postBox.height, viewport.height - Math.max(0, postBox.y))
        }
        console.log('[postClipBox] ✅ Post boundingBox ajustado:', adjustedBox)
        return adjustedBox
      }
    }

    console.log('[postClipBox] ✅ Post boundingBox:', postBox)
    return postBox
  } catch (err) {
    console.log('[postClipBox] ❌ Erro ao calcular clip:', err.message)
    return null
  }
}