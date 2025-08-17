import { chromium, BrowserContext, Page, Locator } from 'playwright'
import { openContextForAccount } from '../../../src/core/automations/facebook/session/context'
import { processPostWithN8n } from './helpers/n8nIntegration'
import { postComment } from '../../../src/core/automations/facebook/actions/postComment'

// ===== Helpers =====
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

function extractPostId(href: string | null): string | null {
  if (!href) return null

  // Remove comment_id se presente na URL
  const cleanHref = href.split('?comment_id=')[0].split('&comment_id=')[0]

  const m = cleanHref.match(/\/posts\/(\d+)|\/permalink\/(\d+)/)
  return m ? (m[1] || m[2]) : cleanHref
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
        acceptNode: function(n) {
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

    // Busca permalink usando estratégias melhoradas, priorizando timestamps do autor
    const timestampSelectors = [
      // Estratégia 1: Timestamp no header do post próximo ao autor (máxima prioridade)
      'div[data-ad-rendering-role="profile_name"] ~ div a[href*="/posts/"]:has(time)',
      'div[data-ad-rendering-role="profile_name"] ~ div a[href*="/posts/"]:has(abbr)',
      'div[data-ad-rendering-role="profile_name"] ~ div a[href*="/permalink/"]:has(time)',
      'div[data-ad-rendering-role="profile_name"] ~ div a[href*="/permalink/"]:has(abbr)',

      // Estratégia 2: Links próximos aos cabeçalhos de post
      'h2 ~ div a[href*="/posts/"]:has(time)',
      'h3 ~ div a[href*="/posts/"]:has(time)',
      'h4 ~ div a[href*="/posts/"]:has(time)',
      'h2 ~ div a[href*="/permalink/"]:has(time)',
      'h3 ~ div a[href*="/permalink/"]:has(time)',
      'h4 ~ div a[href*="/permalink/"]:has(time)',

      // Estratégia 3: Qualquer link com time/abbr que aponte para posts
      'a[href*="/posts/"]:has(time[datetime])',
      'a[href*="/posts/"]:has(abbr[data-utime])',
      'a[href*="/permalink/"]:has(time[datetime])',
      'a[href*="/permalink/"]:has(abbr[data-utime])',

      // Estratégia 4: Elementos time/abbr standalone (fallback)
      'time[datetime]',
      'abbr[data-utime]'
    ];

    let permalink = null;
    let timeEl = null;
    let bestPriority = 999;

    for (let i = 0; i < timestampSelectors.length; i++) {
      const selector = timestampSelectors[i];
      const el = container.querySelector(selector);

      if (el && i < bestPriority) {
        let linkEl = null;
        let currentTimeEl = null;

        if (el.tagName === 'A') {
          linkEl = el as HTMLAnchorElement;
          currentTimeEl = el.querySelector('time, abbr') || el;
        } else if (el.tagName === 'TIME' || el.tagName === 'ABBR') {
          currentTimeEl = el;
          linkEl = el.closest('a') as HTMLAnchorElement;
        }

        if (linkEl && linkEl.href) {
          // Verificar se não está em um comentário
          const isInComment = el.closest('[role="article"][aria-label*="Comment"]') ||
                             el.closest('[aria-label*="Comentário"]') ||
                             el.closest('[data-testid*="comment"]');

          // Se não está em comentário ou se ainda não temos um permalink melhor
          if (!isInComment) {
            permalink = linkEl.href;
            timeEl = currentTimeEl;
            bestPriority = i;
            console.log(`[parseModal] Timestamp encontrado (prioridade ${i}): ${permalink}`);
            break; // Para na primeira estratégia que encontrar um timestamp do post principal
          } else if (!permalink) {
            // Se está em comentário mas ainda não temos nada, usar como fallback
            permalink = linkEl.href;
            timeEl = currentTimeEl;
            bestPriority = i;
            console.log(`[parseModal] Timestamp de comentário encontrado como fallback: ${permalink}`);
          }
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
    let shouldStop = false

    while (processed < maxPosts && scrolls < maxScrolls && !shouldStop) {
      // Verificar se estamos na página correta
      const currentUrl = page.url();
      if (!currentUrl.includes('/groups/')) {
        console.log(`[selectorTester] ⚠️ Não está na página do grupo. URL atual: ${currentUrl}`);
        await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
        await ensureLoggedIn(page, groupUrl);
        continue;
      }

      // Estratégia melhorada: procurar por todos os articles e depois filtrar por aria-posinset
      const feed = page.locator('div[role="feed"]').first();
      const allArticles = feed.locator('div[role="article"]');
      const articleCount = await allArticles.count();

      console.log(`[selectorTester] Encontrados ${articleCount} articles na página (URL: ${currentUrl})`);

      // Filtrar apenas articles que têm aria-posinset
      const articlesWithPosinset = [];
      for (let i = 0; i < articleCount; i++) {
        const article = allArticles.nth(i);
        const posinset = await article.getAttribute('aria-posinset');
        if (posinset) {
          articlesWithPosinset.push({ article, posinset });
        }
      }

      console.log(`[selectorTester] Encontrados ${articlesWithPosinset.length} articles com aria-posinset na página`);

      let navigatedAway = false;
      let processedInThisRound = 0;

      for (let i = 0; i < articlesWithPosinset.length; i++) {
        if (processed >= maxPosts) break

        const { article: post, posinset: ariaPosinset } = articlesWithPosinset[i];

        // Verificar se já foi processado
        if (seen.has(ariaPosinset)) {
          console.log(`[selectorTester] Post ${i + 1}: aria-posinset ${ariaPosinset} já processado`);
          continue;
        }

        // Verificar se o post está visível
        const isVisible = await post.isVisible();
        if (!isVisible) {
          console.log(`[selectorTester] Post ${i + 1}: aria-posinset ${ariaPosinset} não está visível`);
          continue;
        }

        // Buscar timestamp do post principal usando estratégias melhoradas
        let tsLink = null;
        let href = null;

        console.log(`[selectorTester] Buscando timestamp no post ${i + 1} (aria-posinset: ${ariaPosinset})...`);

        // Estratégia 1: Timestamp próximo ao cabeçalho do post (prioridade máxima)
        try {
          const headerTimestampSelectors = [
            'div[data-ad-rendering-role="profile_name"] ~ div a[href*="/posts/"]:has(time)',
            'div[data-ad-rendering-role="profile_name"] ~ div a[href*="/posts/"]:has(abbr)',
            'h2 ~ div a[href*="/posts/"]:has(time)',
            'h3 ~ div a[href*="/posts/"]:has(time)',
            'h4 ~ div a[href*="/posts/"]:has(time)',
          ];

          for (const selector of headerTimestampSelectors) {
            const linkLocator = post.locator(selector).first();
            if (await linkLocator.isVisible({ timeout: 1000 }).catch(() => false)) {
              href = await linkLocator.getAttribute('href');
              const linkText = await linkLocator.textContent() || '';

              // Verificar se não está em um comentário
              const isInComment = await linkLocator.evaluate((el) => {
                return el.closest('[role="article"][aria-label*="Comment"]') !== null ||
                       el.closest('[aria-label*="Comentário"]') !== null;
              });

              if (href && !isInComment) {
                console.log(`[selectorTester] ✅ Timestamp do cabeçalho encontrado! href: ${href}, texto: "${linkText}"`);
                tsLink = linkLocator;
                break;
              }
            }
          }
        } catch (e) {
          console.log(`[selectorTester] Erro na estratégia 1 (cabeçalho):`, e);
        }

        // Estratégia 2: Links com time ou abbr que não estão em comentários
        if (!tsLink) {
          try {
            const timeElements = await post.locator('a:has(time[datetime]), a:has(abbr[data-utime])').all();

            for (const linkLocator of timeElements) {
              try {
                href = await linkLocator.getAttribute('href');
                const linkText = await linkLocator.textContent() || '';

                // Verificar se o href aponta para um post
                const isPostLink = href && (href.includes('/posts/') || href.includes('/permalink/'));

                // Verificar se não está em um comentário
                const isInComment = await linkLocator.evaluate((el) => {
                  return el.closest('[role="article"][aria-label*="Comment"]') !== null ||
                         el.closest('[aria-label*="Comentário"]') !== null;
                });

                if (isPostLink && !isInComment) {
                  console.log(`[selectorTester] ✅ Timestamp com time/abbr encontrado! href: ${href}, texto: "${linkText}"`);
                  tsLink = linkLocator;
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          } catch (e) {
            console.log(`[selectorTester] Erro na estratégia 2 (time/abbr):`, e);
          }
        }

        // Estratégia 3: Procurar por links com padrão de timestamp (fallback)
        if (!tsLink) {
          try {
            const postLinks = await post.locator('a[href*="/posts/"], a[href*="/permalink/"]').all();

            for (const linkLocator of postLinks) {
              try {
                href = await linkLocator.getAttribute('href');
                const linkText = await linkLocator.textContent() || '';

                // Verificar se é um timestamp válido (contém números + unidade de tempo)
                const isTimestamp = /^\d+\s*(h|min|m|s|dia|hora|seg)$/i.test(linkText.trim()) ||
                                   /\d+\s*(h|min|m|s|dia|hora|seg|ago|atrás)/i.test(linkText.trim());

                // Verificar se não está em um comentário
                const isInComment = await linkLocator.evaluate((el) => {
                  return el.closest('[role="article"][aria-label*="Comment"]') !== null ||
                         el.closest('[aria-label*="Comentário"]') !== null;
                });

                if (href && isTimestamp && !isInComment) {
                  console.log(`[selectorTester] ✅ Timestamp de fallback encontrado! href: ${href}, texto: "${linkText}"`);
                  tsLink = linkLocator;
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          } catch (e) {
            console.log(`[selectorTester] Erro na estratégia 3 (fallback):`, e);
          }
        }

        if (!tsLink || !href) {
          console.log(`[selectorTester] ❌ Post ${i + 1} (aria-posinset: ${ariaPosinset}): Não encontrou timestamp clicável do autor.`);

          // Debug detalhado
          try {
            const allLinks = await post.locator('a').all();
            console.log(`[selectorTester] Debug: ${allLinks.length} links encontrados no post`);

            for (let j = 0; j < Math.min(allLinks.length, 5); j++) {
              try {
                const link = allLinks[j];
                const linkHref = await link.getAttribute('href') || '';
                const linkText = await link.textContent() || '';
                const hasTime = await link.locator('time, abbr').count() > 0;

                console.log(`[selectorTester] Link ${j + 1}: "${linkText.trim()}" -> ${linkHref.substring(0, 50)}... (hasTime: ${hasTime})`);
              } catch (e) {
                continue;
              }
            }
          } catch (e) {
            console.log(`[selectorTester] Erro no debug:`, e);
          }

          continue;
        }

        // Limpar comment_id se presente
        if (href.includes('comment_id')) {
          href = href.split('?comment_id=')[0].split('&comment_id=')[0];
          console.log(`[selectorTester] comment_id removido, href limpo: ${href}`);
        }

        const postId = extractPostId(href);

        // Marcar como processado ANTES de processar para evitar duplicatas
        seen.add(ariaPosinset);

        console.log(`[selectorTester] Processando post ${processed + 1}/${maxPosts}: ${postId} (aria-posinset: ${ariaPosinset})`);

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

          // Garantir que o elemento está visível e clicável
          await tsLink.scrollIntoViewIfNeeded();
          await tsLink.waitFor({ state: 'visible', timeout: 5000 });

          // Tentar clique com delay
          await tsLink.click({ delay: rand(50, 150), timeout: 10000 });

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
              console.log(`[selectorTester] Enviando dados para n8n...`);
              const n8nResponse = await processPostWithN8n(payload, webhookUrl);

              if (n8nResponse.shouldComment && n8nResponse.commentText) {
                console.log(`[selectorTester] N8n gerou resposta - comentando no post...`);

                const commentResult = await postComment({
                  page,
                  postUrl: payload.permalink || undefined,
                  message: n8nResponse.commentText,
                  timeoutMs: 10000
                });

                if (commentResult.ok) {
                  console.log(`[selectorTester] Comentário postado com sucesso!`);
                } else {
                  console.warn(`[selectorTester] Erro ao postar comentário: ${commentResult.error}`);
                }
              } else {
                console.log(`[selectorTester] N8n decidiu não comentar neste post`);
              }

              console.log(`[selectorTester] Processamento do post concluído`);

            } catch (err) {
              console.warn(`[selectorTester] Erro no processamento n8n para post ${payload.postId}:`, (err as Error).message);
            }
          }

          processed++;
          processedInThisRound++;

          console.log(`[selectorTester] Post processado com sucesso!`);

          // Fechar modal ou voltar à página anterior
          if (mode === 'modal') {
            await closePostModal(page);
            await sleep(500);
          } else {
            await page.goBack({ waitUntil: 'domcontentloaded' });
            await ensureLoggedIn(page, groupUrl);
          }

          // PARAR IMEDIATAMENTE após processar um post
          shouldStop = true;
          console.log(`[selectorTester] ✅ Finalizado após processar 1 post com sucesso`)
          console.log(`[selectorTester] ✅ Posts processados: ${processed}, posts únicos encontrados: ${seen.size}`)
          break;
        } catch (e) {
          console.warn(`[selectorTester] Erro ao processar post ${postId}:`, (e as Error).message);

          // Tenta voltar para a página do grupo se navegou para fora
          try {
            const currentUrl = page.url();
            if (!currentUrl.includes('/groups/' + groupUrl.split('/groups/')[1]?.split('/')[0])) {
              console.log(`[selectorTester] Voltando para a página do grupo de: ${currentUrl}`);
              await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
              await ensureLoggedIn(page, groupUrl);
              navigatedAway = true;
              break;
            }
          } catch (navError) {
            console.error(`[selectorTester] Erro fatal de navegação:`, navError);
            shouldStop = true;
            break;
          }
        }

        await sleep(rand(...pauseBetweenPostsMs));

        // Verificar se deve parar
        if (shouldStop) {
          console.log(`[selectorTester] Parando execução conforme solicitado`);
          break;
        }
      }

      if (processed >= maxPosts || shouldStop) {
        console.log(`[selectorTester] Meta de ${maxPosts} posts atingida ou execução interrompida`);
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

        // Se não há posts com aria-posinset, mostrar debug
        if (articlesWithPosinset.length === 0) {
          console.log(`[selectorTester] ⚠️ Nenhum post com aria-posinset encontrado. Verificando se há posts no feed...`);

          const feedChildren = await feed.locator('> div').count();
          console.log(`[selectorTester] Feed tem ${feedChildren} divs filhos diretos`);

          // Verificar se há algum div com aria-posinset em qualquer lugar
          const anyPosinset = await page.locator('div[aria-posinset]').count();
          console.log(`[selectorTester] Total de divs com aria-posinset na página: ${anyPosinset}`);
        }

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