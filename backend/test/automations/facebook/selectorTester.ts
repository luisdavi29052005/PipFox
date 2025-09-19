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
 * Define o formato de cada post que será processado.
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
 * Permite customizar o comportamento do scraper.
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

/**
 * Pausa a execução por um determinado número de milissegundos.
 * @param ms - O tempo em milissegundos para a pausa.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gera um número aleatório dentro de um intervalo.
 * @param min - O valor mínimo.
 * @param max - O valor máximo.
 */
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Extrai um ID de post válido de uma URL do Facebook.
 * Tenta múltiplos padrões de URL para garantir a captura do ID.
 * @param href - A URL a ser analisada.
 * @returns O ID do post ou null se não for encontrado.
 */
function extractPostId(href: string | null): string | null {
  if (!href) return null;

  // Limpa a URL de parâmetros que não são o ID do post
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
 * @param rawTimestamp - O texto do timestamp (ex: "5 min", "Yesterday at 10:00 PM").
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
      console.warn("[parseTimestamp] Falha ao parsear:", rawTimestamp);
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
    console.log(`>> [${groupUrl}] Login já ativo e feed visível.`);
    return;
  } catch {}

  const cookieBtn = page.locator('button:has-text("Allow all cookies"), button:has-text("Aceitar todos")');
  if (await cookieBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await cookieBtn.first().click().catch(() => {});
  }

  const loginHints = page.locator('form[action*="login"], input[name="email"]');
  if (await loginHints.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`>> [${groupUrl}] Faça o login para continuar. O script vai esperar...`);
    await page.waitForURL((url) => url.href.startsWith(groupUrl), { timeout: 180000 });
    await page.locator('div[role="feed"]').first().waitFor({ state: "visible", timeout: 30000 });
    console.log(`>> [${groupUrl}] Login completo e feed carregado.`);
  }
}

/**
 * Detecta e fecha modais que possam aparecer na tela.
 */
async function detectAndCloseModal(page: Page): Promise<boolean> {
  const modalSelector = 'div[role="dialog"], div[aria-modal="true"]';
  const modal = page.locator(modalSelector).first();

  if (await modal.isVisible({ timeout: 500 })) {
    console.log("[detectAndCloseModal] Modal detectado. Fechando com a tecla ESC.");
    await page.keyboard.press("Escape").catch(e => console.warn("Falha ao pressionar ESC", e));
    await sleep(1000);
    return true;
  }
  return false;
}

/**
 * Função principal que extrai todos os dados de um único post.
 * @param postLocator - O Locator do Playwright para o contêiner do post.
 * @returns Um objeto PostData com todas as informações extraídas.
 */
async function parsePost(postLocator: Locator): Promise<PostData> {
    const localPostId = (await postLocator.getAttribute("aria-posinset")) || "unknown";
    
    const data: PostData = {
      postId: null, permalink: null, authorName: null, authorUrl: null,
      timeISO: null, timeText: null, text: null, imageUrls: [],
      videoUrls: [], externalLinks: []
    };

    console.log(`\n--- Processando Post #${localPostId} ---`);

    // 1. Extrair Permalink e Timestamp (Método Combinado e Robusto)
    try {
        // Seletor que busca por links de permalink com atributos comuns, de forma mais genérica.
        const timestampSelector = 'a[href*="/posts/"], a[href*="/permalink/"], a[href*="?story_fbid="]';
        const linkElements = await postLocator.locator(timestampSelector).all();
        
        for (const linkElement of linkElements) {
            const href = await linkElement.getAttribute("href");

            // Validações para garantir que é um link de post e não de comentário, perfil ou foto de perfil
            if (href && !href.includes("comment_id") && !href.includes("/profile.php") && !href.includes("set=a")) {
                const fullUrl = href.startsWith("http") ? href : `https://www.facebook.com${href}`;
                const realPostId = extractPostId(fullUrl);

                if (realPostId && !data.postId) { // Pega apenas o primeiro ID de post válido
                    data.permalink = fullUrl;
                    data.postId = realPostId;
                    
                    // Tenta obter o texto do timestamp de várias fontes para maior chance de sucesso
                    const ariaLabel = await linkElement.getAttribute("aria-label").catch(() => null);
                    const innerText = await linkElement.innerText().catch(() => null);
                    const title = await linkElement.getAttribute("title").catch(() => null);

                    let timestampText = (ariaLabel || innerText || title || '').trim().replace(/&nbsp;/g, ' ');
                    
                    // Validação para garantir que o texto é um timestamp provável
                    const isValidTimestamp = timestampText.length > 0 && timestampText.length < 100 && !/[<>{}]/.test(timestampText);
                    
                    if (isValidTimestamp) {
                        data.timeText = timestampText;
                        data.timeISO = parseTimestamp(data.timeText);
                        // Se encontramos um timestamp válido, podemos parar de procurar
                        if(data.permalink && data.postId && data.timeText) break;
                    }
                }
            }
        }
    } catch (e) { 
        console.log(`[ERRO] Falha ao extrair Permalink/Timestamp: ${(e as Error).message}`);
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
          // Clica em "Ver mais" se existir para expandir o texto
          const seeMoreButton = textLocator.locator('div[role="button"]:has-text("See more"), div[role="button"]:has-text("Ver mais")');
          if(await seeMoreButton.isVisible({timeout: 200})) {
              await seeMoreButton.click().catch(() => {});
              await sleep(300);
          }
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
        // Filtra avatares, emojis e imagens já adicionadas
        if (src && !src.includes("emoji") && !src.includes("static") && !data.imageUrls.includes(src)) {
          data.imageUrls.push(src);
        }
      }
    } catch (e) { 
      console.log(`[ERRO] Imagens: ${(e as Error).message}`);
    }

    // 5. Fallback final para Permalink (Hover intensivo)
    // Se ainda não temos o permalink, faremos uma varredura em todos os links do post.
    if (!data.permalink) {
      try {
          const allLinks = await postLocator.locator('a[href]').all();
          for (const link of allLinks) {
              await link.hover({ timeout: 300 }).catch(() => {});
              const href = await link.getAttribute("href");
              if (href && (href.includes("/posts/") || href.includes("/permalink/")) && !href.includes("comment_id")) {
                  const fullUrl = href.startsWith("http") ? href : `https://www.facebook.com${href}`;
                  const realPostId = extractPostId(fullUrl);
                  if (realPostId) {
                      data.permalink = fullUrl;
                      data.postId = realPostId;
                      console.log("[INFO] Permalink encontrado via fallback intensivo.");
                      break;
                  }
              }
          }
      } catch (e) { 
        console.log(`[ERRO] Permalink (Hover intensivo): ${(e as Error).message}`);
      }
    }

    // 6. Fallback de emergência para Permalink (Construção manual)
    if (!data.permalink) {
      const currentUrl = postLocator.page().url();
      const groupIdMatch = currentUrl.match(/\/groups\/(\d+)/);
      if (groupIdMatch && localPostId !== "unknown") {
        data.permalink = `https://www.facebook.com/groups/${groupIdMatch[1]}/posts/${localPostId}`;
        data.postId = localPostId;
        console.log("[INFO] Permalink construído manualmente como última alternativa.");
      }
    }

    // Log dos resultados da extração para este post
    console.log(`Post ID: ${data.postId || 'NAO ENCONTRADO'}`);
    console.log(`Autor: ${data.authorName || 'NAO ENCONTRADO'}`);
    console.log(`Texto: ${data.text ? `${data.text.substring(0, 50)}... (${data.text.length} caracteres)` : 'NAO ENCONTRADO'}`);
    console.log(`Imagens: ${data.imageUrls.length}`);
    console.log(`Timestamp: ${data.timeText || 'NAO ENCONTRADO'}`);
    console.log(`Status Final: ${data.postId ? 'SUCESSO' : 'FALHA'}`);
    console.log(`--- Fim do Post #${localPostId} ---\n`);
    
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
    { name: "Timestamp (Método Principal)", selector: 'a[href*="/posts/"], a[href*="/permalink/"]', required: true },
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

  console.log(allGood ? "✅ Saúde dos seletores OK." : "❌ FALHA: Seletores críticos não encontrados. O scraping pode falhar.");
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
    jsonOutputPath
  } = options;

  // Adicionando a URL do webhook como fallback para garantir que seja usada.
  const webhookUrl = options.webhookUrl || "http://localhost:5678/webhook/fb-bot-repl";

  console.log(`🚀 Iniciando scraping para: ${groupUrl}`);
  console.log(`   - Meta de posts: ${maxPosts}`);
  if (webhookUrl) console.log(`   - Webhook ativo: Sim`);

  const context = await openContextForAccount(userId, accountId, headless);
  const page = await context.newPage();
  const results: Array<PostData & { groupUrl: string }> = [];
  const seen = new Set<string>();

  try {
    await page.goto(groupUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await ensureLoggedIn(page, groupUrl);
    
    if (options.healthCheckOnly) {
        await runSelectorHealthCheck(page);
        await context.close();
        return;
    };

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
          await postElement.scrollIntoViewIfNeeded({ timeout: 5000 });
          await sleep(300);
          const data = await parsePost(postElement);

          if (data.postId) {
            const payload = { ...data, groupUrl };
            results.push(payload);

            if (webhookUrl) {
              console.log(`[Webhook] Enviando post ${payload.postId} para o webhook...`);
              await processPostWithN8n(payload, webhookUrl)
                .then(() => console.log(`[Webhook] Post ${payload.postId} enviado com SUCESSO.`))
                .catch(err => 
                  console.error(`[Webhook] ERRO ao enviar post ${payload.postId}:`, err.message)
                );
            }
          } else {
              console.warn(`[AVISO] Post ${posinsetValue} ignorado por falta de um ID de post válido.`);
          }

          await sleep(rand(...pauseBetweenPostsMs));
        } catch (error) {
          console.error(`❌ Erro crítico ao processar post ${posinsetValue} no grupo ${groupUrl}:`, (error as Error).message);
        }
      }

      if (newPostsFound === 0 && results.length < maxPosts) {
        scrolls++;
        console.log(`📜 [${groupUrl}] Scroll ${scrolls}/${maxScrolls} - Nenhum post novo visível, rolando a página...`);
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
        await sleep(2000); // Espera para o conteúdo carregar
      } else {
        // Reseta a contagem de scrolls se novos posts forem encontrados
        scrolls = 0;
      }
    }
  } catch (error) {
    console.error(`❌ Erro geral durante o processamento do grupo ${groupUrl}:`, error);
  } finally {
    if (saveToJson && results.length > 0) {
        const outputDir = jsonOutputPath || path.join(process.cwd(), "output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const groupName = new URL(groupUrl).pathname.split('/')[2] || 'group';
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `facebook_posts_${groupName}_${timestamp}.json`;
        const filePath = path.join(outputDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify({ meta: { ...options, processed: results.length }, posts: results }, null, 2));
        console.log(`\n💾 Resultados para ${groupUrl} salvos em: ${filePath}`);
    }
    await context.close();
    console.log(`✅ Teste finalizado para o grupo: ${groupUrl}. Total de posts processados: ${results.length}`);
  }
}

// =============================================================================
// CLI INTERFACE (Ponto de entrada para execução via terminal)
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    // --- INÍCIO DA CONFIGURAÇÃO ---
    const WEBHOOK_URL = "http://localhost:5678/webhook/dd50047c-1753-4146-bac1-52cd26335fd2";

    // Lista de URLs dos grupos para processar
    const groupUrls = [
      "https://www.facebook.com/groups/940840924057399",
      "https://www.facebook.com/groups/301237675753904",
      "https://www.facebook.com/groups/1218045145877129"
      // Adicione mais URLs de grupos aqui se necessário
    ];

    // Configurações de execução
    const MAX_POSTS_PER_GROUP = 50;
    const RUN_HEADLESS = process.argv.includes("--headless");
    // --- FIM DA CONFIGURAÇÃO ---

    console.log("--- Configurações de Execução ---");
    console.log(`Webhook Ativo: ${WEBHOOK_URL}`);
    console.log(`Modo Headless: ${RUN_HEADLESS}`);
    console.log(`Máximo de Posts por Grupo: ${MAX_POSTS_PER_GROUP}`);
    console.log("---------------------------------");

    const { getTestIds } = await import("./helpers/getTestIds");
    let { userId, accountId } = await getTestIds() || {};

    if (!userId || !accountId) {
      console.error("❌ Não foi possível obter IDs de teste. Verifique a configuração em ./helpers/getTestIds.");
      process.exit(1);
    }
    
    // Permite passar uma URL de grupo específica pela linha de comando, que terá prioridade sobre a lista.
    const urlsToProcess = process.argv[2] && process.argv[2].startsWith('http') ? [process.argv[2]] : groupUrls;

    console.log(`\n🚀 Iniciando processamento SIMULTÂNEO para ${urlsToProcess.length} grupo(s).`);

    const tasks = urlsToProcess.map(url => {
        console.log(`   -> Agendando tarefa para: ${url}`);
        return testSelectors({ 
            userId, 
            accountId, 
            groupUrl: url, 
            headless: RUN_HEADLESS, 
            maxPosts: MAX_POSTS_PER_GROUP,
            webhookUrl: WEBHOOK_URL // Passando a URL do webhook para a função principal
        });
    });

    await Promise.all(tasks);

    console.log(`\n\n✅ Processamento simultâneo de todos os grupos foi finalizado.`);
  }

  main().catch((err) => {
    console.error("💥 Erro fatal na execução principal:", err);
    process.exit(1);
  });
}

