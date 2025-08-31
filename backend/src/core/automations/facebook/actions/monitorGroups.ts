import { Page } from "playwright";
import { supabase } from "../../../../services/supabaseClient";

export type MonitorOptions = {
  maxPosts?: number;
  delayBetween?: number;
  useGraphQLTap?: boolean;
};

export type ExtractedPost = {
  url: string | null;
  author: string | null;
  text: string | null;
  images: string[];
  timestamp: string;
  extractedFromModal: boolean;
  postId: string | null;
  authorUrl: string | null;
  timeISO: string | null;
  timeText: string | null;
  videoUrls: string[];
  externalLinks: Array<{ url: string; text: string; domain: string }>;
  contentHash: string;
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Salva dados do post no Supabase na tabela leads
 */
async function savePostToSupabase(extractedData: ExtractedPost, nodeId: string, groupUrl: string): Promise<void> {
  try {
    // Verificar se o post já existe para evitar duplicatas
    const { data: existing, error: selectError } = await supabase
      .from('leads')
      .select('id')
      .eq('post_url', extractedData.url)
      .eq('node_id', nodeId)
      .single();

    if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error(`[savePostToSupabase] Erro ao verificar post existente:`, selectError);
      return;
    }

    if (existing) {
      console.log(`[savePostToSupabase] Post já existe no banco: ${extractedData.postId}`);
      return;
    }

    // Inserir novo lead
    const { data, error } = await supabase.from('leads').insert({
      node_id: nodeId,
      post_url: extractedData.url || `https://facebook.com/post/${extractedData.postId}`,
      post_author: extractedData.author,
      post_text: extractedData.text,
      status: 'extracted',
      created_at: new Date().toISOString()
    }).select();

    if (error) {
      console.error(`[savePostToSupabase] Erro ao salvar post ${extractedData.postId}:`, error);
    } else {
      console.log(`[savePostToSupabase] ✅ Post salvo com sucesso: ${extractedData.postId} (grupo: ${groupUrl})`);
    }
  } catch (err) {
    console.error(`[savePostToSupabase] Erro inesperado:`, err);
  }
}

/**
 * Extrai um ID de post válido de uma URL do Facebook.
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
 */
function parseTimestamp(rawTimestamp: string): string | null {
  if (!rawTimestamp) return null;

  try {
    let normalized = rawTimestamp
      .trim()
      .replace(/\s+/g, " ")
      .replace(/&nbsp;/g, " ");

    const relativeMatch = normalized.match(
      /^(\d+)\s*(h|min|m|s|seg|hora|dia|day|hr)s?\s*(ago|atrás)?$/i,
    );
    if (relativeMatch) {
      const value = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();
      const now = new Date();

      switch (unit) {
        case "min":
        case "m":
          now.setMinutes(now.getMinutes() - value);
          break;
        case "h":
        case "hr":
        case "hora":
          now.setHours(now.getHours() - value);
          break;
        case "d":
        case "dia":
        case "day":
          now.setDate(now.getDate() - value);
          break;
        case "s":
        case "seg":
          now.setSeconds(now.getSeconds() - value);
          break;
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

/**
 * Garante que o usuário está logado e a página do grupo está carregada.
 */
async function ensureLoggedIn(page: Page, groupUrl: string) {
  try {
    await page
      .locator('div[role="feed"]')
      .first()
      .waitFor({ state: "visible", timeout: 8000 });
    console.log(">> Login já ativo e feed visível.");
    return;
  } catch {}

  const cookieBtn = page.locator(
    'button:has-text("Allow all cookies"), button:has-text("Aceitar todos")',
  );
  if (
    await cookieBtn
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    await cookieBtn
      .first()
      .click()
      .catch(() => {});
  }

  const loginHints = page.locator('form[action*="login"], input[name="email"]');
  if (
    await loginHints
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    console.log(">> Faça o login para continuar. O script vai esperar...");
    await page.waitForURL((url) => url.href.startsWith(groupUrl), {
      timeout: 180000,
    });
    await page
      .locator('div[role="feed"]')
      .first()
      .waitFor({ state: "visible", timeout: 30000 });
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
    await page.keyboard
      .press("Escape")
      .catch((e) => console.warn("Falha ao pressionar ESC", e));
    await sleep(1000);
    return true;
  }
  return false;
}

/**
 * Função principal que extrai todos os dados de um único post.
 */
async function parsePost(postLocator: any): Promise<ExtractedPost> {
  const localPostId =
    (await postLocator.getAttribute("aria-posinset")) || "unknown";

  const data: ExtractedPost = {
    postId: null,
    url: null,
    author: null,
    authorUrl: null,
    timeISO: null,
    timeText: null,
    text: null,
    images: [],
    videoUrls: [],
    externalLinks: [],
    timestamp: new Date().toISOString(),
    extractedFromModal: false,
    contentHash: localPostId,
  };

  console.log(`\n--- POST #${localPostId} ---`);

  // 1. Extrair Permalink e Timestamp
  try {
    const parentContainerSelector =
      "div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x6s0dn4.x17zd0t2.x78zum5.x1q0g3np.x1a02dak";
    const timestampContainer = postLocator
      .locator(parentContainerSelector)
      .first();

    if (await timestampContainer.isVisible({ timeout: 500 })) {
      await timestampContainer.hover({ timeout: 1000 }).catch(() => {});
      await sleep(500);

      const linkElements = await timestampContainer.locator("a[href]").all();

      for (const linkElement of linkElements) {
        await linkElement.hover({ timeout: 500 }).catch(() => {});
        await sleep(200);

        const href = await linkElement.getAttribute("href");

        if (href && !href.includes("comment_id")) {
          const fullUrl = href.startsWith("http")
            ? href
            : `https://www.facebook.com${href}`;
          const realPostId = extractPostId(fullUrl);

          if (realPostId) {
            data.url = fullUrl;
            data.postId = realPostId;
            data.contentHash = realPostId;

            const ariaLabel = await linkElement
              .getAttribute("aria-label")
              .catch(() => null);
            const innerText = await linkElement.innerText().catch(() => null);

            let timestampText = ariaLabel || innerText || "";
            timestampText = timestampText.trim().replace(/&nbsp;/g, " ");

            const isValidTimestamp =
              timestampText.length > 0 &&
              timestampText.length < 100 &&
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
  if (!data.url) {
    try {
      const timestampSelector =
        'a[href*="/posts/"][aria-label], a[href*="/permalink/"][aria-label]';
      const linkElements = await postLocator.locator(timestampSelector).all();

      for (const linkElement of linkElements) {
        await linkElement.hover({ timeout: 500 }).catch(() => {});
        await sleep(300);

        const href = await linkElement.getAttribute("href");
        if (href && !href.includes("comment_id")) {
          const fullUrl = href.startsWith("http")
            ? href
            : `https://www.facebook.com${href}`;
          const realPostId = extractPostId(fullUrl);
          if (realPostId) {
            data.url = fullUrl;
            data.postId = realPostId;
            data.contentHash = realPostId;

            const ariaLabel = await linkElement
              .getAttribute("aria-label")
              .catch(() => "");
            if (ariaLabel && ariaLabel.length < 100) {
              data.timeText = ariaLabel.trim().replace(/&nbsp;/g, " ");
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
    const authorSelector =
      'h2 a, h3 a, [data-ad-rendering-role="profile_name"] a';
    const authorLocator = postLocator.locator(authorSelector).first();
    if (await authorLocator.isVisible({ timeout: 500 })) {
      data.author = (await authorLocator.innerText()).trim();
      data.authorUrl = await authorLocator.getAttribute("href");
    }
  } catch (e) {
    console.log(`[ERRO] Autor: ${(e as Error).message}`);
  }

  // 3. Extrair Texto do Post
  try {
    const textSelector =
      '[data-ad-preview="message"], [data-testid="post_message"]';
    const textLocator = postLocator.locator(textSelector).first();
    if (await textLocator.isVisible({ timeout: 500 })) {
      data.text = (await textLocator.innerText()).trim();
    }
  } catch (e) {
    console.log(`[ERRO] Texto: ${(e as Error).message}`);
  }

  // 4. Extrair Mídia (Imagens)
  try {
    const imgLocators = await postLocator
      .locator('a[href*="/photo/"] img, img[src*="scontent"]')
      .all();

    for (const img of imgLocators) {
      const src = await img.getAttribute("src");
      if (
        src &&
        !src.includes("emoji") &&
        !src.includes("static") &&
        !data.images.includes(src)
      ) {
        data.images.push(src);
      }
    }
  } catch (e) {
    console.log(`[ERRO] Imagens: ${(e as Error).message}`);
  }

  // Fallback final para URL
  if (!data.url) {
    const currentUrl = postLocator.page().url();
    const groupIdMatch = currentUrl.match(/\/groups\/(\d+)/);
    if (groupIdMatch && localPostId !== "unknown") {
      data.url = `https://www.facebook.com/groups/${groupIdMatch[1]}/posts/${localPostId}`;
      data.postId = localPostId;
      data.contentHash = localPostId;
    }
  }

  // Log simplificado dos resultados
  console.log(`Post ID: ${data.postId || "NAO ENCONTRADO"}`);
  console.log(`Autor: ${data.author || "NAO ENCONTRADO"}`);
  console.log(
    `Texto: ${data.text ? `${data.text.length} caracteres` : "NAO ENCONTRADO"}`,
  );
  console.log(`Imagens: ${data.images.length}`);
  console.log(`Timestamp: ${data.timeText || "NAO ENCONTRADO"}`);
  console.log(`Status: ${data.postId ? "SUCESSO" : "FALHA"}`);
  console.log(`--- Fim Post #${localPostId} ---\n`);

  return data;
}

// =============================================================================
// MAIN MONITORING LOGIC - SEM CICLOS
// =============================================================================

export async function* monitorGroup(
  page: Page,
  groupUrl: string,
  workflowId: string,
  running: Map<string, boolean>,
) {
  console.log("[monitorGroup] Iniciando monitoramento:", {
    groupUrl,
    workflowId,
  });

  try {
    // Navegar para o grupo
    await page.goto(String(groupUrl), { waitUntil: "domcontentloaded" });

    // Garantir login e feed carregado
    await ensureLoggedIn(page, groupUrl);

    console.log("[monitorGroup] Feed carregado com sucesso");
    await page.waitForTimeout(3000);

    // Buscar nodes do workflow para obter configurações
    const { data: workflowNodes, error: nodesError } = await supabase
      .from("workflow_nodes")
      .select("*")
      .eq("workflow_id", workflowId)
      .eq("is_active", true);

    if (nodesError) {
      console.error(
        "[monitorGroup] Erro ao buscar workflow nodes:",
        nodesError,
      );
      yield {
        success: false,
        error: "Erro ao buscar configurações do workflow",
        timestamp: new Date().toISOString(),
        groupUrl: String(groupUrl),
        workflowId,
      };
      return;
    }

    if (!workflowNodes || workflowNodes.length === 0) {
      console.error(
        "[monitorGroup] Nenhum node ativo encontrado para o workflow",
      );
      yield {
        success: false,
        error: "Nenhum node ativo encontrado",
        timestamp: new Date().toISOString(),
        groupUrl: String(groupUrl),
        workflowId,
      };
      return;
    }

    const processedPosts = new Set<string>();
    const maxPosts = 50; // Limite máximo de posts por execução
    const maxScrolls = 10; // Limite máximo de scrolls
    let scrollCount = 0;
    let foundPosts = 0;

    console.log(
      `[monitorGroup] Iniciando busca por posts (limite: ${maxPosts})`,
    );

    // Loop principal - SEM ciclos infinitos
    while (
      running.get(workflowId) &&
      foundPosts < maxPosts &&
      scrollCount < maxScrolls
    ) {
      try {
        await detectAndCloseModal(page);

        // Buscar posts usando a nova lógica
        const postsOnPage = await page.locator("div[aria-posinset]").all();
        let newPostsFound = 0;

        // Processar cada post
        for (const postElement of postsOnPage) {
          if (!running.get(workflowId) || foundPosts >= maxPosts) break;

          const posinsetValue = await postElement.getAttribute("aria-posinset");
          if (!posinsetValue) continue;

          // Verificar se já processamos este aria-posinset específico
          if (processedPosts.has(posinsetValue)) {
            continue;
          }

          // Marcar como processado ANTES de extrair para evitar duplicatas
          processedPosts.add(posinsetValue);
          newPostsFound++;
          foundPosts++;

          try {
            await postElement.scrollIntoViewIfNeeded();
            await sleep(300);

            // Usar a nova função de parsing
            const extractedData = await parsePost(postElement);

            if (extractedData.postId) {
              console.log(
                `[monitorGroup] ✅ Post processado: ${extractedData.author || "Autor desconhecido"} - ${extractedData.text ? extractedData.text.substring(0, 50) + "..." : "Sem texto"} (ID: ${extractedData.contentHash}, nodes: ${workflowNodes.length})`,
              );

              // Salvando no Supabase para cada node ativo
              for (const node of workflowNodes) {
                await savePostToSupabase(extractedData, node.id, String(groupUrl));
              }

              yield {
                success: true,
                url: extractedData.url,
                author: extractedData.author,
                text: extractedData.text,
                images: extractedData.images,
                timestamp: extractedData.timestamp,
                contentHash: extractedData.contentHash,
                extractedFromModal: extractedData.extractedFromModal,
                groupUrl: String(groupUrl),
                workflowId,
                nodeId: workflowNodes.length > 0 ? workflowNodes[0].id : null, // Assumindo o primeiro node como exemplo
              };

              // Pequena pausa entre posts
              await sleep(rand(500, 1000));
            } else {
              console.warn(
                `[monitorGroup] Post ${posinsetValue} ignorado por falta de ID válido`,
              );
            }
          } catch (postError) {
            console.error(
              `[monitorGroup] Erro ao processar post ${posinsetValue}:`,
              postError,
            );
            continue;
          }
        }

        // Se não encontrou posts novos, fazer scroll
        if (newPostsFound === 0) {
          scrollCount++;
          console.log(
            `[monitorGroup] Scroll ${scrollCount}/${maxScrolls} - Carregando mais posts...`,
          );

          try {
            await page.evaluate(() =>
              window.scrollBy(0, window.innerHeight * 2),
            );
            await sleep(2000);
          } catch (scrollError) {
            console.warn(`[monitorGroup] Erro no scroll:`, scrollError);
            break;
          }
        } else {
          console.log(
            `[monitorGroup] Encontrados ${newPostsFound} posts novos (total: ${foundPosts})`,
          );
          // Reset scroll count quando encontra posts
          scrollCount = 0;
          await sleep(1000);
        }
      } catch (loopError) {
        console.error(
          "[monitorGroup] Erro no loop de monitoramento:",
          loopError,
        );

        // Apenas parar se for erro crítico de página fechada
        if (
          loopError instanceof Error &&
          (loopError.message.includes(
            "Target page, context or browser has been closed",
          ) ||
            loopError.message.includes("Page closed"))
        ) {
          yield {
            success: false,
            error: loopError.message,
            timestamp: new Date().toISOString(),
            groupUrl: String(groupUrl),
            workflowId,
          };
          break;
        }

        // Para outros erros, aguardar e continuar
        console.log("[monitorGroup] Erro recuperável, aguardando...");
        await sleep(3000);
        continue;
      }
    }

    console.log(
      `[monitorGroup] Monitoramento finalizado. Posts processados: ${foundPosts}`,
    );
  } catch (error) {
    console.error("[monitorGroup] Erro fatal:", error);
    yield {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      groupUrl: String(groupUrl),
      workflowId,
    };
  }

  console.log("[monitorGroup] Monitoramento finalizado");
}

export default monitorGroup;
