// backend/src/core/automations/facebook/utils/facebook-post-selectors.ts
// Pacote de seletores + utilitários para detectar posts (e NÃO comentários) no feed/grupos do Facebook (Comet 2025)
// Uso: import { findAllPosts, extractMetaFromPost, postClipBox } from '../utils/facebook-post-selectors'

export const FEED = '[role="feed"]'

// Blocos a EXCLUIR (comentários, reels, etc.)
export const EXCLUDE = [
  '[aria-label*="Comment"]',
  '[aria-label*="Comentários"]',
  '[aria-label*="Comments"]',
  '[aria-label*="Responder"]',
  '[aria-label*="Write a comment"]',
  '[aria-label*="Escreva um comentário"]',
  '[data-visualcompletion="ignore-dynamic"] [role="article"]', // popups/modais
  '[data-pagelet*="Stories"]',
  '[aria-label*="Stories"]',
  '[aria-label*="Reels"]',
  'div[role="dialog"] *',
].join(', ')

// Delimitadores do post (rodapé/ações)
export const ACTIONS = [
  '[role="toolbar"]',
  '[aria-label*="Actions for this post"]',
  '[aria-label*="Ações da publicação"]',
  'div[role="group"]:has(button[aria-label*="Like"], button[aria-label*="Curtir"])',
  'div:has(> div[role="button"]:has-text("Like"))',
  'div:has(> div[role="button"]:has-text("Curtir"))',
].join(', ')

// Candidatos de container do POST.
export const POST_CONTAINERS: string[] = [
  `${FEED} > div ${'[role="article"]'}[aria-posinset]`,
  `${FEED} ${'[role="article"]'}[aria-posinset]`,
  `${FEED} :is(div,section,article) ${'[role="article"]'}:has(h3)`,
  `${FEED} :is(div,section,article)[aria-posinset] :is([role="article"], article)`,
  `${FEED} ${'[role="article"]'}:has(h3 a[role="link"][href*="/groups/"])`,
  `${FEED} ${'[role="article"]'}:has(h3 a[role="link"][href*="/user/"])`,
  `${FEED} ${'[role="article"]'}:has(h3 a[role="link"][href*="/people/"])`,
  `${FEED} ${'[role="article"]'}:has(h3 a[role="link"][href*="/profile.php"])`,
  `${FEED} ${'[role="article"]'}:has([aria-label][role="link"])`,
  `${FEED} ${'[role="article"]'}:has([aria-posinset])`,
  `${FEED} ${'[role="article"]'}:not(:has(${EXCLUDE}))`,
]

// Seletores de AUTOR
export const AUTHOR: string[] = [
  'h3 a[aria-label][role="link"]',
  'a[aria-label][role="link"]',
  'h3 [role="link"]',
  '[role="link"][tabindex]:not([tabindex="-1"])',
  'a[role="link"][href*="/user/"]',
  'a[role="link"][href*="/people/"]',
  'a[role="link"][href*="/profile.php"]',
  'h3 b > span',
  'h3 strong > span',
]

// Seletores de TEXTO do post (preferir containers Comet de mensagem)
export const TEXT: string[] = [
  '[data-ad-preview*="message"]',
  '[data-ad-comet-preview]',
  'div[dir] :is(div, span):not(:has(a,img,video,svg,button))',
  'div[lang] :is(div, span):not(:has(a,img,video,svg,button))',
]

// Seletores de IMAGEM principal (excluir ícones/emoji)
export const IMAGES: string[] = [
  'img[src*="fbcdn"], img[src*="scontent"], img[src*="safe_image"]',
  'a[href*="photo"] img',
  'a[role="link"] img',
  '[style*="background-image"]',
]

// Seletores de PERMALINK do post
export const PERMALINK: string[] = [
  'a[href*="/posts/"]',
  'a[href*="/permalink/"]',
  'a[aria-label] abbr',
]

// Utilitários ---------------------------------------------------------------
export const pickFirst = async (root: any, selectors: string[]) => {
  for (const sel of selectors) {
    const loc = root.locator(sel)
    const count = await loc.count().catch(() => 0)
    if (count) {
      const el = await loc.first().elementHandle().catch(() => null)
      if (el) return el
    }
  }
  return null
}

export const findAllPosts = async (page: any) => {
  let loc = page.locator(POST_CONTAINERS.join(', '))
  // Filtro de visibilidade & exclusões
  loc = loc.filter({ hasNot: page.locator(EXCLUDE) })
  // Exigir barra de ações para ancorar o fim do post
  loc = loc.filter({ has: page.locator(ACTIONS) })
  return loc
}

export async function extractMetaFromPost(el: any) {
  // author
  const authorEl = await pickFirst(el, AUTHOR)
  let author: string | undefined
  if (authorEl) {
    const txt = (await authorEl.textContent()) || ''
    const aria = (await authorEl.getAttribute('aria-label')) || ''
    author = (txt || aria).trim() || undefined
  }

  // texto
  let text = ''
  for (const sel of TEXT) {
    const blocks = el.locator(sel)
    const count = await blocks.count().catch(() => 0)
    if (count) {
      for (let i = 0; i < Math.min(count, 4); i++) {
        const t = (await blocks.nth(i).innerText().catch(() => '')).trim()
        if (t && t.length > 20) text += (text ? '\n\n' : '') + t
      }
      if (text) break
    }
  }
  const textPreview = text || undefined

  // imagem
  let imageUrl: string | undefined
  for (const sel of IMAGES) {
    const imgs = el.locator(sel)
    const n = await imgs.count().catch(() => 0)
    for (let i = 0; i < n; i++) {
      const handle = await imgs.nth(i).elementHandle().catch(() => null)
      if (!handle) continue
      const tag = await handle.evaluate((node: any) => node.tagName.toLowerCase())
      let src: string | null = null
      if (tag === 'img') src = await handle.getAttribute('src')
      else src = await handle.evaluate((node: HTMLElement) => getComputedStyle(node).backgroundImage.replace(/^url\(["']?|["']?\)$/g, ''))
      if (!src) continue
      const low = src.toLowerCase()
      if (low.includes('emoji') || low.includes('static') || low.includes('sprited')) continue
      imageUrl = src
      break
    }
    if (imageUrl) break
  }

  // permalink
  let url: string | undefined
  for (const sel of PERMALINK) {
    const a = el.locator(sel)
    const count = await a.count().catch(() => 0)
    if (count) {
      const href = await a.first().getAttribute('href')
      if (href) { url = href; break }
    }
  }

  return { author, text: textPreview, image: imageUrl, url }
}

// Heurística para screenshot: do topo do artigo até as ações
export async function postClipBox(el: any, page: any) {
  const postBox = await el.boundingBox()
  if (!postBox) return null
  const actions = await pickFirst(el, [ACTIONS])
  if (!actions) return postBox
  const actBox = await actions.boundingBox()
  if (!actBox) return postBox
  const height = Math.min(postBox.height, (actBox.y + actBox.height) - postBox.y)
  return { x: postBox.x, y: postBox.y, width: postBox.width, height }
}
