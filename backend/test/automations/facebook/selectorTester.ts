
import { chromium, BrowserContext, Page, Locator } from 'playwright'
import { openContextForAccount } from '../../../src/core/automations/facebook/session/context'

// ===== Helpers =====
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

function extractPostId(href: string | null): string | null {
  if (!href) return null
  const m = href.match(/\/posts\/(\d+)/)
  return m ? m[1] : href
}

async function closePostModal(page: Page) {
  const dialog = page.locator('div[role="dialog"][aria-modal="true"]')
  await page.keyboard.press('Escape')
  try {
    await dialog.waitFor({ state: 'hidden', timeout: 6000 })
    return
  } catch {}
  const closeBtn = page.locator(
    [
      'div[role="dialog"][aria-modal="true"] [aria-label="Close"]',
      'div[role="dialog"][aria-modal="true"] [aria-label="Fechar"]',
      'div[role="dialog"][aria-modal="true"] [data-testid="modal-close-button"]',
    ].join(', '),
  )
  if (await closeBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await closeBtn.first().click().catch(()=>{})
    await dialog.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  }
}

// ===== Session/Login guard =====
async function ensureLoggedIn(page: Page, groupUrl: string) {
  // Tenta encontrar o feed primeiro, se já estiver logado
  try {
    await page.locator('div[role="feed"]').first().waitFor({ state: 'visible', timeout: 8000 })
    console.log('>> Login já ativo e feed visível.')
    return
  } catch {}

  // Lida com o banner de cookies se ele aparecer
  const cookieBtn = page.locator(
    'button:has-text("Allow all cookies"), button:has-text("Aceitar todos"), button:has-text("Aceitar tudo")',
  );
  if (await cookieBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await cookieBtn.first().click().catch(() => {});
  }

  // Detecta a tela de login
  const loginHints = page.locator(
    'form[action*="login"], input[name="email"], input[id="email"], div[role="dialog"] input[name="email"]',
  );
  
  if (await loginHints.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('>> Faça o login e clique em qualquer botão "Continuar" ou "Agora não" que aparecer. O script vai esperar...');
    
    // Espera a URL ser a do grupo
    await page.waitForURL(
        (url) => url.href.startsWith(groupUrl), 
        { timeout: 180000, waitUntil: 'domcontentloaded' }
    );

    // Espera o feed carregar
    await page.locator('div[role="feed"]').first().waitFor({ state: 'visible', timeout: 30000 });
    
    console.log('>> Login completo e feed carregado. Continuando a execução.');
    return;
  }

  // Verificação final
  await page.locator('div[role="feed"]').first().waitFor({ state: 'visible', timeout: 60000 });
}

// ===== Extract data from posts =====
export type PostData = {
  postId: string | null
  permalink: string | null
  authorName: string | null
  authorUrl: string | null
  timeISO: string | null
  timeText: string | null
  text: string | null
  imageUrls: string[]
}

async function parseModal(page: Page): Promise<PostData> {
  // Aguarda um pouco para garantir que o modal/página carregou
  await sleep(1000);
  
  return await page.evaluate(() => {
    // Tenta encontrar o modal primeiro, senão usa o body (para posts que abrem em nova página)
    const dialog = document.querySelector('div[role="dialog"][aria-modal="true"]') as HTMLElement | null;
    const container = dialog || document.body;
    
    const pickText = (el: Element | null): string | null => {
      if (!el) return null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const t = n.textContent?.trim() || '';
          return t.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      const parts: string[] = [];
      while (walker.nextNode()) parts.push(walker.currentNode.textContent!.trim());
      const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
      return joined || null;
    };

    // Encontra o article principal
    const article = container.querySelector('div[role="article"]') || container;

    // Busca permalink usando várias estratégias
    const timestampSelectors = [
      'a[href*="/groups/"][href*="/posts/"]:has(time)',
      'a[href*="/posts/"]:has(time)',
      'a:has(time[datetime])',
      'a:has(abbr[data-utime])',
      'time[datetime]',
      'abbr[data-utime]'
    ];

    let permalink = null;
    let timeEl = null;

    for (const selector of timestampSelectors) {
      const el = container.querySelector(selector);
      if (el) {
        if (el.tagName === 'A') {
          permalink = (el as HTMLAnchorElement).href;
          timeEl = el.querySelector('time, abbr');
          break;
        } else if (el.tagName === 'TIME' || el.tagName === 'ABBR') {
          timeEl = el;
          const parentLink = el.closest('a');
          if (parentLink) {
            permalink = parentLink.href;
          }
          break;
        }
      }
    }

    // Se não achou permalink, tenta pegar da URL atual
    if (!permalink && window.location.href.includes('/posts/')) {
      permalink = window.location.href;
    }

    // Busca autor usando múltiplas estratégias
    const authorSelectors = [
      'h2 strong a[role="link"]',
      'h3 strong a[role="link"]',
      'h4 strong a[role="link"]',
      '[data-testid="story-subtitle"] a[role="link"]',
      'strong a[href*="/user/"]',
      'strong a[href*="/profile.php"]',
      'span[dir="ltr"] strong a'
    ];

    let authorA = null;
    for (const selector of authorSelectors) {
      authorA = article.querySelector(selector) as HTMLAnchorElement | null;
      if (authorA && authorA.textContent?.trim()) {
        break;
      }
    }

    // Busca texto do post usando múltiplas estratégias
    const textSelectors = [
      '[data-ad-preview="message"]',
      '[data-testid="post_message"]',
      '[data-ad-comet-preview="message"]',
      'div[dir="auto"][style*="text-align"]',
      'div[data-testid*="story"] div[dir="auto"]',
      'span[dir="auto"]'
    ];

    let bestText = '';
    let maxLength = 0;

    for (const selector of textSelectors) {
      const elements = article.querySelectorAll(selector);
      elements.forEach(el => {
        const text = pickText(el);
        if (text && text.length > maxLength && text.length > 10) {
          bestText = text;
          maxLength = text.length;
        }
      });
    }

    // Busca imagens, filtrando emoji e perfis
    const imgEls = Array.from(article.querySelectorAll('img[src]')) as HTMLImageElement[];
    const images = Array.from(new Set(
      imgEls
        .map(i => i.src)
        .filter(src => 
          src && 
          !src.includes('emoji') && 
          !src.includes('static') && 
          !src.includes('profile') && 
          !src.includes('transparent') &&
          (src.includes('scontent') || src.includes('fbcdn'))
        )
        .slice(0, 12)
    ));

    // Extrai ID do post
    const href = permalink || '';
    const postIdMatch = href.match(/\/posts\/(\d+)|\/permalink\/(\d+)|story_fbid=(\d+)/);
    const postId = postIdMatch ? (postIdMatch[1] || postIdMatch[2] || postIdMatch[3]) : null;

    const result = {
      postId,
      permalink,
      authorName: authorA?.textContent?.trim() || null,
      authorUrl: authorA?.href || null,
      timeISO: (timeEl as any)?.getAttribute?.('datetime') || (timeEl as any)?.getAttribute?.('data-utime') || null,
      timeText: timeEl?.textContent?.trim() || null,
      text: bestText || null,
      imageUrls: images
    };

    console.log('[parseModal] Resultado:', result);
    return result;
  });
}

export interface SelectorTestOptions {
  userId: string
  accountId: string
  groupUrl: string
  webhookUrl?: string
  headless?: boolean
  maxPosts?: number
  maxScrolls?: number
  pauseBetweenPostsMs?: [number, number]
}

// CLI Interface
if (require.main === module) {
  async function main() {
    const { getTestIds } = await import('./helpers/getTestIds')
    
    let userId = process.argv[2]
    let accountId = process.argv[3]
    const groupUrl = process.argv[4] || 'https://www.facebook.com/groups/940840924057399'
    const headless = process.argv.includes('--headless')
    const maxPosts = parseInt(process.argv.find(arg => arg.startsWith('--max-posts='))?.split('=')[1] || '5')

    // Auto discovery
    if (!userId || !accountId || userId === 'auto' || accountId === 'auto') {
      console.log('🔄 Buscando IDs automaticamente...')
      const testIds = await getTestIds()

      if (!testIds) {
        console.error('❌ Não foi possível obter IDs de teste')
        process.exit(1)
      }

      userId = testIds.userId
      accountId = testIds.accountId
      console.log(`✅ Usando conta: ${testIds.accountName} (${testIds.status})`)
    }

    try {
      await testSelectors({
        userId,
        accountId,
        groupUrl,
        headless,
        maxPosts
      })
      console.log('✅ Teste standalone concluído com sucesso')
      process.exit(0)
    } catch (err) {
      console.error('❌ Erro no teste standalone:', err)
      process.exit(1)
    }
  }

  main().catch(err => {
    console.error('💥 Erro fatal:', err)
    process.exit(1)
  })
}

/**
 * Testa os seletores usando a sessão oficial do projeto
 */
export async function testSelectors(options: SelectorTestOptions) {
  const {
    userId,
    accountId,
    groupUrl,
    webhookUrl = process.env.WEBHOOK_URL,
    headless = false,
    maxPosts = 25,
    maxScrolls = 120,
    pauseBetweenPostsMs = [700, 1400],
  } = options

  if (!groupUrl) throw new Error('groupUrl é obrigatória')

  console.log(`[selectorTester] Iniciando teste para grupo: ${groupUrl}`)
  console.log(`[selectorTester] Usando conta: ${accountId}`)

  // Usar o contexto oficial do projeto
  const context = await openContextForAccount(userId, accountId, headless)
  const page = await context.newPage()

  try {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded' })
    await ensureLoggedIn(page, groupUrl)

    const seen = new Set<string>()
    let processed = 0
    let scrolls = 0

    while (processed < maxPosts && scrolls < maxScrolls) {
      const articles = page.locator('div[role="feed"]').first().locator('div[role="article"]')
      const count = await articles.count()

      console.log(`[selectorTester] Encontrados ${count} articles na página`)

      let navigatedAway = false;
      let processedInThisRound = 0;

      for (let i = 0; i < count; i++) {
        if (processed >= maxPosts) break

        const post = articles.nth(i)
        
        // Estratégia otimizada para encontrar timestamp links baseada na estrutura real do Facebook
        const tsSelectors = [
          // Estratégia 1: Link direto com href de post
          'a[href*="/posts/"][role="link"]',
          'a[href*="/permalink/"][role="link"]',
          
          // Estratégia 2: Links que contêm elementos de tempo (estrutura observada)
          'a[role="link"]:has(span span b)',  // Como "1h" dividido em <b>1</b><b>h</b>
          'a[href*="/posts/"]:has(b)',
          
          // Estratégia 3: Seletores tradicionais
          'a[href*="/groups/"][href*="/posts/"]:has(time)',
          'a[href*="/posts/"]:has(time)', 
          'a:has(time)',
          'a:has(abbr[data-utime])'
        ];

        let tsLink = null;
        let href = null;

        for (const selector of tsSelectors) {
          try {
            const linkLocator = post.locator(selector).first();
            if (await linkLocator.count() > 0) {
              tsLink = linkLocator;
              href = await tsLink.getAttribute('href');
              
              // Validação mais robusta do href
              if (href && (
                href.includes('/posts/') || 
                href.includes('/permalink/') ||
                href.includes('story_fbid=') ||
                href.match(/facebook\.com\/.*\/\d+/) // Pattern genérico para posts
              )) {
                // Teste adicional: verificar se o link contém texto de tempo
                const linkText = await tsLink.textContent().catch(() => '');
                const hasTimePattern = /\d+\s*(h|min|dia|day|hora|m|s|seg|second|minute|hour)/.test(linkText || '');
                
                if (hasTimePattern || selector.includes('/posts/')) {
                  console.log(`[selectorTester] Timestamp encontrado via: ${selector}, href: ${href}, texto: "${linkText}"`);
                  break;
                }
              }
            }
          } catch (e) {
            continue;
          }
        }

        if (!tsLink || !href) {
          console.log(`[selectorTester] Post ${i + 1}: Não encontrou timestamp clicável`);
          continue;
        }

        const postId = extractPostId(href);

        if (!postId || seen.has(postId)) {
          console.log(`[selectorTester] Post ${i + 1}: ID ${postId} já processado ou inválido`);
          continue;
        }
        
        seen.add(postId);
        console.log(`[selectorTester] Processando post ${processed + 1}/${maxPosts}: ${postId}`);

        try {
          // Scroll para o post estar visível
          await post.scrollIntoViewIfNeeded();
          await sleep(500);

          // Promise para detectar se abre modal ou navega para nova página
          const modalPromise = page.locator('div[role="dialog"][aria-modal="true"]').waitFor({ 
            state: 'visible', 
            timeout: 10000 
          }).then(() => 'modal' as const).catch(() => null);
          
          const urlPromise = page.waitForURL(/\/posts\/|\/permalink\//, { 
            timeout: 10000 
          }).then(() => 'page' as const).catch(() => null);

          // Clica no timestamp
          console.log(`[selectorTester] Clicando no timestamp do post ${postId}`);
          await tsLink.click({ delay: rand(50, 150) });

          // Aguarda modal ou navegação
          const mode = await Promise.race([modalPromise, urlPromise, sleep(3000).then(() => null)]);

          if (!mode) {
            console.warn(`[selectorTester] Post ${postId}: Timeout - nem modal nem navegação detectada`);
            continue;
          }

          console.log(`[selectorTester] Post ${postId}: Aberto via ${mode}`);
          await sleep(1000); // Aguarda carregamento

          // Extrai dados do post
          const data = await parseModal(page);
          const payload = { ...data, postId: data.postId || postId, groupUrl };
          
          console.log(`[selectorTester] Dados extraídos:`, {
            postId: payload.postId,
            author: payload.authorName,
            textLength: payload.text?.length || 0,
            images: payload.imageUrls.length
          });

          if (webhookUrl) {
            try {
              await sendToWebhook(payload, webhookUrl);
              console.log(`[selectorTester] Dados enviados para webhook`);
            } catch (err) {
              console.warn(`[selectorTester] Erro no webhook para post ${payload.postId}:`, (err as Error).message);
            }
          }

          processed++;
          processedInThisRound++;
          
          // Fechar modal ou voltar à página anterior
          if (mode === 'modal') {
            await closePostModal(page);
            await sleep(500);
            
            // Verifica se ainda está na página do grupo
            if (!page.url().includes(groupUrl)) {
              await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
              await ensureLoggedIn(page, groupUrl);
              navigatedAway = true;
              break;
            }
          } else {
            await page.goBack({ waitUntil: 'domcontentloaded' });
            await ensureLoggedIn(page, groupUrl);
            navigatedAway = true;
            break; 
          }
        } catch (e) {
          console.warn(`[selectorTester] Erro ao processar post ${postId}:`, (e as Error).message);
          
          // Tenta voltar para a página do grupo
          try {
            if (!page.url().includes(groupUrl)) {
              await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
              await ensureLoggedIn(page, groupUrl);
              navigatedAway = true;
              break;
            }
          } catch (navError) {
            console.error(`[selectorTester] Erro fatal de navegação:`, navError);
            break;
          }
        }
        
        await sleep(rand(...pauseBetweenPostsMs));
      }

      if (processed >= maxPosts) {
        console.log(`[selectorTester] Meta de ${maxPosts} posts atingida`);
        break;
      }
      
      if (navigatedAway) {
        console.log(`[selectorTester] Navegou para fora, recarregando artigos...`);
        continue;
      }

      // Se não processou nenhum post nesta rodada, faz scroll
      if (processedInThisRound === 0) {
        scrolls++;
        console.log(`[selectorTester] Scroll ${scrolls}/${maxScrolls} (nenhum post processado nesta rodada)`);
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9)).catch(()=>{});
        await sleep(rand(1200, 2000));
      }
    }

    console.log(`[selectorTester] ✅ Finalizado. Posts processados: ${processed}, posts únicos encontrados: ${seen.size}`)
    
  } finally {
    await context.close()
  }
}

async function sendToWebhook(data: PostData & { groupUrl: string }, webhookUrl: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    })
    if (!res.ok) {
        const errorBody = await res.text().catch(() => 'N/A')
        throw new Error(`Webhook respondeu com status ${res.status}. Body: ${errorBody}`)
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Timeout: Webhook não respondeu em 15 segundos.')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}
