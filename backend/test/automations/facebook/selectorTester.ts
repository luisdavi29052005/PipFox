import { BrowserContext, Locator, Page } from "playwright";
import { openContextForAccount } from "../../../src/core/automations/facebook/session/context";
import { processPostWithN8n } from "./helpers/n8nIntegration";
import fs from "fs";
import path from "path";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Estrutura de dados para um post extraído.
 */
export type PostData = {
  postId: string | null;
  permalink: string | null;
  authorName: string | null;
  authorUrl: string | null;
  timeISO: string | null;
  timeText: string | null;
  text: string | null;
  imageUrls: string[];
  videoUrls: string[];
  externalLinks: Array<{ url: string; text: string; domain: string }>;
};

/**
 * Opções para a execução do script de teste.
 */
export interface SelectorTestOptions {
  userId: string;
  accountId: string;
  groupUrl: string;
  webhookUrl?: string;
  headless?: boolean;
  maxPosts?: number;
  maxScrolls?: number;
  pauseBetweenPostsMs?: [number, number];
  healthCheckOnly?: boolean;
  saveToJson?: boolean;
  jsonOutputPath?: string;
}


// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Extrai um ID de post válido de uma URL do Facebook.
 * Prioriza IDs de grupos e IDs globais de post.
 * @param href A URL a ser analisada.
 * @returns O ID do post ou null se não for encontrado.
 */
function extractPostId(href: string | null): string | null {
  if (!href) return null;

  const cleanHref = href.split("?comment_id=")[0].split("&comment_id=")[0];

  const patterns = [
    /set=gm\.(\d{10,})/,
    /\/groups\/\d+\/posts\/(\d{10,})/,
    /\/groups\/\d+\/permalink\/(\d{10,})/,
    /\/posts\/(\d{10,})/,
    /\/permalink\/(\d{10,})/,
    /story_fbid=(\d{10,})/,
    /\/photo\/[^\/]*\/\?.*story_fbid=(\d{10,})/,
    /\/photo.*set=gm\.(\d{10,})/,
  ];

  for (const pattern of patterns) {
    const match = cleanHref.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Converte timestamps relativos ou absolutos em formato ISO 8601.
 * @param rawTimestamp O texto do timestamp (ex: "5 min", "Yesterday at 10:00 PM").
 * @returns A data em formato ISO ou null.
 */
function parseTimestamp(rawTimestamp: string): string | null {
    if (!rawTimestamp) return null;

    try {
      let normalized = rawTimestamp.trim().replace(/\s+/g, " ").replace(/&nbsp;/g, ' ');

      const relativeMatch = normalized.match(/^(\d+)\s*(h|min|m|s|seg|hora|dia|day|hr)s?\s*(ago|atrás)?$/i);
      if (relativeMatch) {
        const value = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        const now = new Date();

        switch (unit) {
          case "min": case "m": now.setMinutes(now.getMinutes() - value); break;
          case "h": case "hr": case "hora": now.setHours(now.getHours() - value); break;
          case "d": case "dia": case "day": now.setDate(now.getDate() - value); break;
          case "s": case "seg": now.setSeconds(now.getSeconds() - value); break;
        }
        return now.toISOString();
      }

      const date = new Date(normalized);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }

      return null;
    } catch (e) {
      console.warn("[parseTimestamp] Failed to parse:", rawTimestamp);
      return null;
    }
}


// =============================================================================
// CORE AUTOMATION LOGIC
// =============================================================================

/**
 * Garante que o usuário está logado e a página do grupo está carregada.
 */
async function ensureLoggedIn(page: Page, groupUrl: string) {
  try {
    await page.locator('div[role="feed"]').first().waitFor({ state: "visible", timeout: 8000 });
    console.log(">> Login já ativo e feed visível.");
    return;
  } catch {}

  const cookieBtn = page.locator('button:has-text("Allow all cookies"), button:has-text("Aceitar todos")');
  if (await cookieBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await cookieBtn.first().click().catch(() => {});
  }

  const loginHints = page.locator('form[action*="login"], input[name="email"]');
  if (await loginHints.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(">> Faça o login para continuar. O script vai esperar...");
    await page.waitForURL((url) => url.href.startsWith(groupUrl), { timeout: 180000 });
    await page.locator('div[role="feed"]').first().waitFor({ state: "visible", timeout: 30000 });
    console.log(">> Login completo e feed carregado.");
  }
}

/**
 * Detecta e fecha modais que possam aparecer na tela.
 */
async function detectAndCloseModal(page: Page): Promise<boolean> {
  const modalSelector = 'div[role="dialog"], div[aria-modal="true"]';
  const modal = page.locator(modalSelector).first();

  if (await modal.isVisible({ timeout: 500 })) {
    console.log("[detectAndCloseModal] Modal detectado.");
    await page.keyboard.press("Escape").catch(e => console.warn("Falha ao pressionar ESC", e));
    await sleep(1000);
    return true;
  }
  return false;
}

/**
 * Função principal que extrai todos os dados de um único post.
 * @param postLocator O Locator do Playwright para o contêiner do post.
 * @returns Um objeto PostData com todas as informações extraídas.
 */
async function parsePost(postLocator: Locator): Promise<PostData> {
    const localPostId = (await postLocator.getAttribute("aria-posinset")) || "unknown";
    
    const data: PostData = {
      postId: null, permalink: null, authorName: null, authorUrl: null,
      timeISO: null, timeText: null, text: null, imageUrls: [],
      videoUrls: [], externalLinks: []
    };

    console.log(`\n--- POST #${localPostId} ---`);

    // 1. Extrair Permalink e Timestamp
    try {
      const parentContainerSelector = 'div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x6s0dn4.x17zd0t2.x78zum5.x1q0g3np.x1a02dak';
      const timestampContainer = postLocator.locator(parentContainerSelector).first();

      if (await timestampContainer.isVisible({ timeout: 500 })) {
        await timestampContainer.hover({ timeout: 1000 }).catch(() => {});
        await sleep(500);
        
        const linkElements = await timestampContainer.locator('a[href]').all();

        for (const linkElement of linkElements) {
          await linkElement.hover({ timeout: 500 }).catch(() => {});
          await sleep(200);
          
          const href = await linkElement.getAttribute("href");

          if (href && !href.includes("comment_id")) {
            const fullUrl = href.startsWith("http") ? href : `https://www.facebook.com${href}`;
            const realPostId = extractPostId(fullUrl);

            if (realPostId) {
              data.permalink = fullUrl;
              data.postId = realPostId;
              
              // Extrair timestamp de forma mais segura
              const ariaLabel = await linkElement.getAttribute("aria-label").catch(() => null);
              const innerText = await linkElement.innerText().catch(() => null);
              
              // Preferir aria-label, mas validar se não está corrompido
              let timestampText = ariaLabel || innerText || '';
              timestampText = timestampText.trim().replace(/&nbsp;/g, ' ');
              
              // Verificar se o texto parece válido (não contém muitos caracteres especiais)
              const isValidTimestamp = timestampText.length > 0 && timestampText.length < 100 && 
                                     !/[^\w\s\-\:\.\/àáâãéêíóôõúç]/gi.test(timestampText);
              
              if (isValidTimestamp) {
                data.timeText = timestampText;
                data.timeISO = parseTimestamp(data.timeText);
              }
              
              break; 
            }
          }
        }
      }
    } catch (e) { 
      console.log(`[ERRO] Timestamp: ${(e as Error).message}`);
    }

    // Fallback se o método principal falhar
    if (!data.permalink) {
      try {
          const timestampSelector = 'a[href*="/posts/"][aria-label], a[href*="/permalink/"][aria-label]';
          const linkElements = await postLocator.locator(timestampSelector).all();
          
          for (const linkElement of linkElements) {
              await linkElement.hover({ timeout: 500 }).catch(() => {});
              await sleep(300);
              
              const href = await linkElement.getAttribute("href");
              if (href && !href.includes("comment_id")) {
                  const fullUrl = href.startsWith("http") ? href : `https://www.facebook.com${href}`;
                  const realPostId = extractPostId(fullUrl);
                  if (realPostId) {
                      data.permalink = fullUrl;
                      data.postId = realPostId;
                      
                      const ariaLabel = await linkElement.getAttribute("aria-label").catch(() => '');
                      if (ariaLabel && ariaLabel.length < 100) {
                        data.timeText = ariaLabel.trim().replace(/&nbsp;/g, ' ');
                        data.timeISO = parseTimestamp(data.timeText);
                      }
                      break;
                  }
              }
          }
      } catch (e) {
        console.log(`[ERRO] Fallback: ${(e as Error).message}`);
      }
    }

    // 2. Extrair Autor
    try {
      const authorSelector = 'h2 a, h3 a, [data-ad-rendering-role="profile_name"] a';
      const authorLocator = postLocator.locator(authorSelector).first();
      if (await authorLocator.isVisible({ timeout: 500 })) {
        data.authorName = (await authorLocator.innerText()).trim();
        data.authorUrl = await authorLocator.getAttribute("href");
      }
    } catch (e) { 
      console.log(`[ERRO] Autor: ${(e as Error).message}`);
    }

    // 3. Extrair Texto do Post
    try {
      const textSelector = '[data-ad-preview="message"], [data-testid="post_message"]';
      const textLocator = postLocator.locator(textSelector).first();
      if (await textLocator.isVisible({ timeout: 500 })) {
          data.text = (await textLocator.innerText()).trim();
      }
    } catch (e) { 
      console.log(`[ERRO] Texto: ${(e as Error).message}`);
    }

    // 4. Extrair Mídia (Imagens)
    try {
      const imgLocators = await postLocator.locator('a[href*="/photo/"] img, img[src*="scontent"]').all();
      
      for (const img of imgLocators) {
        const src = await img.getAttribute("src");
        if (src && !src.includes("emoji") && !src.includes("static") && !data.imageUrls.includes(src)) {
          data.imageUrls.push(src);
        }
      }
    } catch (e) { 
      console.log(`[ERRO] Imagens: ${(e as Error).message}`);
    }

    // Tentativa final se ainda não temos permalink
    if (!data.permalink) {
      try {
          const allLinks = await postLocator.locator('a[href]').all();
          
          for (const link of allLinks) {
              await link.hover({ timeout: 500 }).catch(() => {});
              await sleep(200);
              
              const href = await link.getAttribute("href");
              if (href && (href.includes("/posts/") || href.includes("/permalink/")) && !href.includes("comment_id")) {
                  const fullUrl = href.startsWith("http") ? href : `https://www.facebook.com${href}`;
                  const realPostId = extractPostId(fullUrl);
                  if (realPostId) {
                      data.permalink = fullUrl;
                      data.postId = realPostId;
                      break;
                  }
              }
          }
      } catch (e) { 
        console.log(`[ERRO] Hover intensivo: ${(e as Error).message}`);
      }
    }

    // Fallback final
    if (!data.permalink) {
      const currentUrl = postLocator.page().url();
      const groupIdMatch = currentUrl.match(/\/groups\/(\d+)/);
      if (groupIdMatch && localPostId !== "unknown") {
        data.permalink = `https://www.facebook.com/groups/${groupIdMatch[1]}/posts/${localPostId}`;
        data.postId = localPostId;
      }
    }

    // Log simplificado dos resultados
    console.log(`Post ID: ${data.postId || 'NAO ENCONTRADO'}`);
    console.log(`Autor: ${data.authorName || 'NAO ENCONTRADO'}`);
    console.log(`Texto: ${data.text ? `${data.text.length} caracteres` : 'NAO ENCONTRADO'}`);
    console.log(`Imagens: ${data.imageUrls.length}`);
    console.log(`Timestamp: ${data.timeText || 'NAO ENCONTRADO'}`);
    console.log(`Status: ${data.postId ? 'SUCESSO' : 'FALHA'}`);
    console.log(`--- Fim Post #${localPostId} ---\n`);
    
    return data;
}

/**
 * Roda uma verificação de saúde nos seletores críticos da página.
 */
async function runSelectorHealthCheck(page: Page): Promise<boolean> {
  console.log("\n--- Verificação de Saúde dos Seletores ---");
  const criticalSelectors = [
    { name: "Âncora de Post (aria-posinset)", selector: "div[aria-posinset]", required: true },
    { name: "Contêiner do Feed", selector: 'div[role="feed"]', required: true },
    { name: "Elemento de Artigo", selector: 'div[role="article"]', required: true },
    { name: "Contêiner de Autor", selector: 'h2 a, h3 a', required: true },
    { name: "Contêiner de Texto", selector: '[data-ad-preview="message"], [data-testid="post_message"]', required: true },
    { name: "Elemento de Timestamp (Método Novo - Container Pai)", selector: 'div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x6s0dn4.x17zd0t2.x78zum5.x1q0g3np.x1a02dak', required: true },
    { name: "Elemento de Timestamp (Fallback)", selector: 'a[href*="/posts/"][aria-label]', required: false },
  ];

  let allGood = true;
  for (const { name, selector, required } of criticalSelectors) {
    try {
      const count = await page.locator(selector).count();
      const status = count > 0 ? "✅" : "❌";
      console.log(`[Health Check] ${name}: ${status} (${count} encontrados)`);
      if (required && count === 0) {
        allGood = false;
      }
    } catch (error) {
      console.error(`[Health Check] Erro ao testar "${name}":`, (error as Error).message);
      if (required) allGood = false;
    }
  }

  console.log(allGood ? "✅ Saúde dos seletores OK." : "❌ FALHA: Seletores críticos não encontrados.");
  console.log("-----------------------------------------\n");
  return allGood;
}

// =============================================================================
// MAIN EXECUTION SCRIPT
// =============================================================================

/**
 * Função principal que orquestra o processo de scraping.
 */
export async function testSelectors(options: SelectorTestOptions) {
  const {
    userId, accountId, groupUrl, headless = false, maxPosts = 25,
    maxScrolls = 240, pauseBetweenPostsMs = [700, 1400], saveToJson = true,
    jsonOutputPath, webhookUrl
  } = options;

  console.log(`🚀 Iniciando teste de seletores`);
  console.log(`   - Grupo: ${groupUrl}`);
  console.log(`   - Meta: ${maxPosts} posts`);

  const context = await openContextForAccount(userId, accountId, headless);
  const page = await context.newPage();
  const results: Array<PostData & { groupUrl: string }> = [];
  const seen = new Set<string>();

  try {
    await page.goto(groupUrl, { waitUntil: "domcontentloaded" });
    await ensureLoggedIn(page, groupUrl);
    await runSelectorHealthCheck(page);

    if (options.healthCheckOnly) return;

    let scrolls = 0;
    while (results.length < maxPosts && scrolls < maxScrolls) {
      await detectAndCloseModal(page);

      const postsOnPage = await page.locator("div[aria-posinset]").all();
      let newPostsFound = 0;

      for (const postElement of postsOnPage) {
        if (results.length >= maxPosts) break;

        const posinsetValue = await postElement.getAttribute("aria-posinset");
        if (!posinsetValue || seen.has(posinsetValue)) continue;

        seen.add(posinsetValue);
        newPostsFound++;

        try {
          await postElement.scrollIntoViewIfNeeded();
          await sleep(300);
          const data = await parsePost(postElement);

          if (data.postId) { // Apenas adiciona se tiver um ID válido
            const payload = { ...data, groupUrl };
            results.push(payload);

            if (webhookUrl) {
              await processPostWithN8n(payload, webhookUrl).catch(err => 
                console.warn(`[Webhook] Erro para post ${payload.postId}:`, err.message)
              );
            }
          } else {
              console.warn(`[testSelectors] Post ${posinsetValue} ignorado por falta de ID real.`);
          }

          await sleep(rand(...pauseBetweenPostsMs));
        } catch (error) {
          console.error(`❌ Erro ao processar post ${posinsetValue}:`, (error as Error).message);
        }
      }

      if (newPostsFound === 0) {
        scrolls++;
        console.log(`📜 Scroll ${scrolls}/${maxScrolls} - Nenhum post novo, carregando mais...`);
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await sleep(2000);
      }
    }
  } catch (error) {
    console.error("❌ Erro geral durante o processamento:", error);
  } finally {
    if (saveToJson && results.length > 0) {
        const outputDir = jsonOutputPath || path.join(process.cwd(), "output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `facebook_posts_${timestamp}.json`;
        const filePath = path.join(outputDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify({ meta: { ...options, processed: results.length }, posts: results }, null, 2));
        console.log(`\n💾 Resultados salvos em: ${filePath}`);
    }
    await context.close();
    console.log("✅ Teste finalizado.");
  }
}

// =============================================================================
// CLI INTERFACE
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const { getTestIds } = await import("./helpers/getTestIds");
    let { userId, accountId } = await getTestIds() || {};

    if (!userId || !accountId) {
      console.error("❌ Não foi possível obter IDs de teste. Verifique a configuração.");
      process.exit(1);
    }

    const groupUrl = process.argv[2] || "https://www.facebook.com/groups/940840924057399";
    const headless = process.argv.includes("--headless");

    // Exemplo de como definir maxPosts. Adicione outras opções conforme necessário.
    const maxPosts = 50; 

    await testSelectors({ userId, accountId, groupUrl, headless, maxPosts });
  }

  main().catch((err) => {
    console.error("💥 Erro fatal:", err);
    process.exit(1);
  });
}
