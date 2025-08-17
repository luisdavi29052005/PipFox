import { chromium, BrowserContext, Page, Locator } from "playwright";
import { openContextForAccount } from "../../../src/core/automations/facebook/session/context";
import { processPostWithN8n } from "./helpers/n8nIntegration";
import { postComment } from "../../../src/core/automations/facebook/actions/postComment";

// ===== Helpers =====
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

function extractPostId(href: string | null): string | null {
  if (!href) return null;

  // Remove comment_id se presente na URL
  const cleanHref = href.split("?comment_id=")[0].split("&comment_id=")[0];

  const m = cleanHref.match(/\/posts\/(\d+)|\/permalink\/(\d+)/);
  return m ? m[1] || m[2] : cleanHref;
}

async function closePostModal(page: Page) {
  const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
  await page.keyboard.press("Escape");
  try {
    await dialog.waitFor({ state: "hidden", timeout: 6000 });
    return;
  } catch {}
  const closeBtn = page.locator(
    [
      'div[role="dialog"][aria-modal="true"] [aria-label="Close"]',
      'div[role="dialog"][aria-modal="true"] [aria-label="Fechar"]',
      'div[role="dialog"][aria-modal="true"] [data-testid="modal-close-button"]',
    ].join(", "),
  );
  if (
    await closeBtn
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)
  ) {
    await closeBtn
      .first()
      .click()
      .catch(() => {});
    await dialog.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  }
}

// ===== Session/Login guard =====
async function ensureLoggedIn(page: Page, groupUrl: string) {
  // Tenta encontrar o feed primeiro, se já estiver logado
  try {
    await page
      .locator('div[role="feed"]')
      .first()
      .waitFor({ state: "visible", timeout: 8000 });
    console.log(">> Login já ativo e feed visível.");
    return;
  } catch {}

  // Lida com o banner de cookies se ele aparecer
  const cookieBtn = page.locator(
    'button:has-text("Allow all cookies"), button:has-text("Aceitar todos"), button:has-text("Aceitar tudo")',
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

  // Detecta a tela de login
  const loginHints = page.locator(
    'form[action*="login"], input[name="email"], input[id="email"], div[role="dialog"] input[name="email"]',
  );

  if (
    await loginHints
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    console.log(
      '>> Faça o login e clique em qualquer botão "Continuar" ou "Agora não" que aparecer. O script vai esperar...',
    );

    // Espera a URL ser a do grupo
    await page.waitForURL((url) => url.href.startsWith(groupUrl), {
      timeout: 180000,
      waitUntil: "domcontentloaded",
    });

    // Espera o feed carregar
    await page
      .locator('div[role="feed"]')
      .first()
      .waitFor({ state: "visible", timeout: 30000 });

    console.log(">> Login completo e feed carregado. Continuando a execução.");
    return;
  }

  // Verificação final
  await page
    .locator('div[role="feed"]')
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
}

// ===== Extract data from posts =====
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
  externalLinks: Array<{url: string; text: string; domain: string}>;
};

// Robust timestamp parser following document guidelines
function parseTimestamp(rawTimestamp: string): string | null {
  if (!rawTimestamp) return null;

  try {
    // Handle relative timestamps like "4h", "2d", "1min"
    const relativeMatch = rawTimestamp.match(
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

    // Try to parse as absolute date
    const date = new Date(rawTimestamp);
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
 * Robust post parsing using stable selectors and semantic anchoring
 * Following the architectural framework from the document
 */
async function parsePost(postLocator: Locator): Promise<PostData> {
  const postId = (await postLocator.getAttribute("aria-posinset")) || "unknown";
  console.log(`[parsePost] Processing post with aria-posinset: ${postId}`);

  // Step 1: Isolate content container to exclude comments (following document strategy)
  // Use the first major child div which contains post content, not comments
  const contentContainer = postLocator.locator("> div > div").first();

  // Step 2: Extract author information using semantic selectors
  let authorName: string | null = null;
  let authorUrl: string | null = null;

  try {
    // Use semantic header structure (h2 > a pattern)
    const authorLocator = contentContainer.locator("h2 a, h3 a, h4 a").first();
    authorName = await authorLocator.innerText({ timeout: 2000 });
    authorUrl = await authorLocator.getAttribute("href");
    console.log(`[parsePost] Author found: ${authorName}`);
  } catch (e) {
    console.warn(
      `[parsePost] Post ${postId}: Could not extract author information`,
    );
  }

  // Step 3: Extract post text with "See More" handling
  let text: string | null = null;
  let externalLinks: Array<{url: string; text: string; domain: string}> = [];

  try {
    // Handle "See More" button first
    const seeMoreButton = contentContainer.locator(
      'div[role="button"]:has-text("See More"), div[role="button"]:has-text("Ver mais")',
    );
    if (await seeMoreButton.isVisible({ timeout: 1000 })) {
      console.log(`[parsePost] Post ${postId}: Expanding "See More" content`);
      await seeMoreButton.click();
      await postLocator.page().waitForTimeout(800);
    }

    // Try multiple text extraction strategies with quality filtering
    const textSelectors = [
      'div[data-ad-preview="message"]',
      '[data-testid="post_message"]',
      'div[data-ad-comet-preview="message"]',
      'div[dir="auto"][style*="text-align"]',
      'span[dir="auto"]',
      'div[dir="auto"]'
    ];

    // Function to check if text is meaningful (not random encoded strings)
    const isValidText = (content: string): boolean => {
      if (!content || content.length < 5) return false;

      const trimmed = content.trim();

      // Filter out common Facebook UI elements
      const uiPatterns = [
        /^Ver tradução$/,
        /^See translation$/,
        /^\d+\s*(min|hora|dia|day|hr)s?\s*(ago|atrás)?$/i,
        /^(Curtir|Like|Comentar|Comment|Compartilhar|Share)$/i,
        /^[a-zA-Z0-9]+\.(com|net|org|br)$/, // Just domain names without protocol
        /^www\.[a-zA-Z0-9]+\.(com|net|org|br)$/, // www domains
        /^https?:\/\/[a-zA-Z0-9]+\.(com|net|org|br)/, // Full URLs
        /^[a-zA-Z0-9]{7}\.(com|net|org)$/, // Facebook tracking URLs like "Q1nF13V.com"
        /^[a-zA-Z0-9]{8,12}\.(com|net|org)$/, // More tracking URLs like "BCsg7iI.com", "BWMrXpleBw.com"
        /^[a-zA-Z0-9]{40,}$/, // Very long random strings without spaces
        /^[a-zA-Z0-9]{20,}$/ // Medium random strings like "stdSopnoreif1ega7fn16m23l20a9facrhmfu4r7ue2L5mmcl93t2"
      ];

      // Check if content matches any UI pattern
      for (const pattern of uiPatterns) {
        if (pattern.test(trimmed)) {
          return false;
        }
      }

      // Check for reasonable word/space ratio (real text should have spaces or be short)
      const words = trimmed.split(/\s+/);
      const totalChars = trimmed.length;
      const wordCount = words.length;

      // If it's all one "word" and longer than 20 chars, it's probably encoded
      if (wordCount === 1 && totalChars > 20) {
        // Unless it contains common readable patterns
        const readablePatterns = [
          /[.!?]/, // Has punctuation
          /[aeiou]{2,}/i, // Has vowel clusters typical in real words
          /\b(the|and|or|but|with|for|at|by|from|to|of|in|on)\b/i // Common English words
        ];

        const hasReadablePattern = readablePatterns.some(pattern => pattern.test(trimmed));
        if (!hasReadablePattern) {
          return false;
        }
      }

      // Check for reasonable character distribution (real text has vowels)
      const vowelCount = (trimmed.match(/[aeiouAEIOU]/g) || []).length;
      const vowelRatio = vowelCount / totalChars;

      // Real text should have at least 15% vowels
      if (vowelRatio < 0.15 && totalChars > 15) {
        return false;
      }

      // Additional check for consecutive identical characters (spam-like)
      if (/(.)\1{4,}/.test(trimmed)) {
        return false;
      }

      return true;
    };

    let maxLength = 0;
    for (const selector of textSelectors) {
      try {
        const textElements = await contentContainer.locator(selector).all();

        for (const textEl of textElements) {
          try {
            const content = await textEl.innerText({ timeout: 1000 });
            if (content && content.trim().length > 10 && isValidText(content)) {
              if (content.trim().length > maxLength) {
                text = content.trim();
                maxLength = content.trim().length;
                console.log(`[parsePost] Post ${postId}: Valid text found via selector "${selector}": "${content.substring(0, 100)}..."`)
              }
            } else if (content && content.trim().length > 10) {
              console.log(`[parsePost] Post ${postId}: Rejected text (invalid): "${content.substring(0, 50)}..." via selector "${selector}"`)
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Extract external links from the entire content container (not just text)
    try {
      const linkLocators = await contentContainer.locator("a[href]").all();
      for (const linkLoc of linkLocators) {
        try {
          const href = await linkLoc.getAttribute("href");
          const linkText = await linkLoc.innerText().catch(() => "");

          if (href) {
            // Filter out Facebook internal links
            const isFacebookLink = href.includes("facebook.com") ||
                                 href.includes("fb.com") ||
                                 href.includes("fb.watch") ||
                                 href.includes("/groups/") ||
                                 href.includes("/posts/") ||
                                 href.includes("/permalink/") ||
                                 href.includes("/photo/") ||
                                 href.includes("/photos/");

            // Include external links or meaningful internal references
            if (!isFacebookLink || href.startsWith("http")) {
              // Clean up the URL for better readability
              let cleanHref = href;
              try {
                const url = new URL(href);
                // Keep only meaningful external domains
                if (!url.hostname.includes("facebook.com") && !url.hostname.includes("fb.com")) {
                  cleanHref = url.href;
                  externalLinks.push({
                    url: cleanHref,
                    text: linkText.trim() || url.hostname,
                    domain: url.hostname
                  });
                }
              } catch (e) {
                // If URL parsing fails, include as is if it looks like a URL
                if (href.startsWith("http") || href.includes(".com") || href.includes(".net") || href.includes(".org")) {
                  externalLinks.push({
                    url: href,
                    text: linkText.trim() || href,
                    domain: "unknown"
                  });
                }
              }
            }
          }
        } catch (e) {
          // Skip failed links
        }
      }

      // Also search for URLs in the text content itself
      if (text) {
        const urlRegex = /https?:\/\/[^\s]+/g;
        const textUrls = text.match(urlRegex) || [];
        for (const url of textUrls) {
          try {
            const urlObj = new URL(url);
            if (!urlObj.hostname.includes("facebook.com") && !urlObj.hostname.includes("fb.com")) {
              externalLinks.push({
                url: url,
                text: urlObj.hostname,
                domain: urlObj.hostname
              });
            }
          } catch (e) {
            // Skip invalid URLs
          }
        }
      }
    } catch (e) {
      // Skip link extraction if fails
    }

    console.log(
      `[parsePost] Post ${postId}: Text extracted (${text?.length || 0} chars, ${externalLinks.length} external links)`,
    );

    // Debug: Log the actual text content
    if (text) {
      console.log(`[parsePost] Post ${postId}: FULL TEXT: "${text}"`);
    } else {
      console.warn(`[parsePost] Post ${postId}: NO TEXT EXTRACTED - trying fallback...`);

      // Last resort: try to get any text from the content container
      try {
        const fallbackText = await contentContainer.innerText({ timeout: 2000 });
        if (fallbackText && fallbackText.trim().length > 20) {
          // Filter out common UI elements and keep only meaningful content
          const lines = fallbackText.split('\n').filter(line => {
            const trimmed = line.trim();
            return trimmed.length > 10 &&
                   !trimmed.match(/^\d+\s*(min|hora|dia|comentário|curtir|compartilhar)/i) &&
                   !trimmed.includes('·') &&
                   !trimmed.match(/^\d+$/) &&
                   !trimmed.match(/^[a-zA-Z0-9]{20,}$/) && // Filter random strings
                   !trimmed.match(/^s\d+[a-zA-Z0-9]+\.com/) && // Filter tracking URLs
                   trimmed !== 'Ver tradução' &&
                   trimmed !== 'See translation';
          });

          // Additional check for meaningful content
          const meaningfulLines = lines.filter(line => {
            const words = line.trim().split(/\s+/);
            const totalChars = line.trim().length;
            const wordCount = words.length;

            // Real text should have multiple words or reasonable length
            return wordCount > 1 || (wordCount === 1 && totalChars < 30);
          });

          if (meaningfulLines.length > 0) {
            text = meaningfulLines.join(' ').trim();
            console.log(`[parsePost] Post ${postId}: FALLBACK TEXT: "${text}"`);
          }
        }
      } catch (e) {
        console.warn(`[parsePost] Post ${postId}: Fallback text extraction failed`);
      }
    }
  } catch (e) {
    console.warn(`[parsePost] Post ${postId}: Could not extract text content`);
  }

  // Step 4: Extract media using stable selectors
  let imageUrls: string[] = [];
  let videoUrls: string[] = [];

  try {
    // Images: Use semantic photo link structure
    const imgLocators = await contentContainer
      .locator('a[href*="/photo/"] img, a[href*="/photos/"] img')
      .all();
    for (const imgLoc of imgLocators) {
      try {
        const src = await imgLoc.getAttribute("src");
        if (
          src &&
          !src.includes("emoji") &&
          !src.includes("static") &&
          (src.includes("scontent") || src.includes("fbcdn"))
        ) {
          imageUrls.push(src);
        }
      } catch (e) {
        // Skip failed images
      }
    }

    // Videos: Direct video element targeting
    const videoLocators = await contentContainer.locator("video[src]").all();
    for (const videoLoc of videoLocators) {
      try {
        const src = await videoLoc.getAttribute("src");
        if (src) {
          videoUrls.push(src);
        }
      } catch (e) {
        // Skip failed videos
      }
    }

    console.log(
      `[parsePost] Post ${postId}: Media extracted (${imageUrls.length} images, ${videoUrls.length} videos)`,
    );
  } catch (e) {
    console.warn(`[parsePost] Post ${postId}: Could not extract media`);
  }

  // Step 5: Extract timestamp and permalink using priority-based strategy
  let timeText: string | null = null;
  let timeISO: string | null = null;
  let permalink: string | null = null;

  try {
    // Priority-based timestamp selector strategy from document
    const timestampSelectors = [
      // Strategy 1: Header timestamps (highest priority)
      'div[data-ad-rendering-role="profile_name"] ~ div a[href*="/posts/"]',
      'div[data-ad-rendering-role="profile_name"] ~ div a[href*="/permalink/"]',
      // Strategy 2: Heading proximity
      'h2 ~ div a[href*="/posts/"]',
      'h3 ~ div a[href*="/posts/"]',
      'h4 ~ div a[href*="/posts/"]',
      // Strategy 3: Generic time elements
      'a[href*="/posts/"]:has(time)',
      'a[href*="/posts/"]:has(abbr)',
      'a[href*="/permalink/"]:has(time)',
      'a[href*="/permalink/"]:has(abbr)',
      // Strategy 4: Fallback
      'span > a[href*="/posts/"]',
      'span > a[href*="/permalink/"]',
    ];

    for (const selector of timestampSelectors) {
      try {
        const timestampLoc = contentContainer.locator(selector).first();
        if (await timestampLoc.isVisible({ timeout: 500 })) {
          // Check if not in comments
          const isInComment = await timestampLoc.evaluate((el) => {
            return (
              el.closest('[role="article"][aria-label*="Comment"]') !== null ||
              el.closest('[aria-label*="Comentário"]') !== null ||
              el.closest('[data-testid*="comment"]') !== null
            );
          });

          if (!isInComment) {
            timeText = await timestampLoc.innerText();
            permalink = await timestampLoc.getAttribute("href");

            if (timeText) {
              timeISO = parseTimestamp(timeText.trim());
            }

            console.log(
              `[parsePost] Post ${postId}: Timestamp found via selector "${selector}": "${timeText}"`,
            );
            break;
          }
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }
  } catch (e) {
    console.warn(
      `[parsePost] Post ${postId}: Could not extract timestamp/permalink`,
    );
  }

  // Extract post ID from permalink if available
  let extractedPostId = postId;
  if (permalink) {
    const postIdMatch = permalink.match(
      /\/posts\/(\d+)|\/permalink\/(\d+)|story_fbid=(\d+)/,
    );
    if (postIdMatch) {
      extractedPostId =
        postIdMatch[1] || postIdMatch[2] || postIdMatch[3] || postId;
    }
  }

  const result: PostData = {
    postId: extractedPostId,
    permalink,
    authorName,
    authorUrl,
    timeISO,
    timeText,
    text,
    imageUrls: Array.from(new Set(imageUrls)), // Remove duplicates
    videoUrls: Array.from(new Set(videoUrls)),
    externalLinks: Array.from(new Set(externalLinks)),
  };

  console.log(`[parsePost] Post ${postId} parsing complete:`, {
    hasAuthor: !!result.authorName,
    hasText: !!result.text,
    hasTimestamp: !!result.timeText,
    hasPermalink: !!result.permalink,
    mediaCount: result.imageUrls.length + result.videoUrls.length,
    linksCount: result.externalLinks.length,
  });

  return result;
}

// Legacy parseModal function for backward compatibility
async function parseModal(page: Page): Promise<PostData> {
  console.log(
    "[parseModal] Using legacy modal parsing - consider migrating to parsePost()",
  );

  // Try to find the modal or use current page
  const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
  const isModal = await dialog.isVisible({ timeout: 1000 }).catch(() => false);

  if (isModal) {
    // If modal is visible, find the article within it
    const article = dialog.locator('div[role="article"]').first();
    return await parsePost(article);
  } else {
    // If no modal, find the main article on the page
    const article = page.locator('div[role="article"]').first();
    return await parsePost(article);
  }
}

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
}

// Selector health check based on document recommendations
async function runSelectorHealthCheck(page: Page): Promise<boolean> {
  console.log("[Health Check] Verificando seletores críticos...");

  const criticalSelectors = [
    {
      name: "aria-posinset anchor",
      selector: "div[aria-posinset]",
      required: true,
    },
    { name: "feed container", selector: 'div[role="feed"]', required: true },
    {
      name: "article elements",
      selector: 'div[role="article"]',
      required: true,
    },
    { name: "author headers", selector: "h2 a, h3 a, h4 a", required: false },
    {
      name: "text containers",
      selector: 'div[data-ad-preview="message"]',
      required: false,
    },
    {
      name: "timestamp links",
      selector: 'a[href*="/posts/"]',
      required: false,
    },
  ];

  let healthScore = 0;
  const results = [];

  for (const test of criticalSelectors) {
    try {
      const elements = await page.locator(test.selector).count();
      const success = elements > 0;

      if (success) healthScore++;

      results.push({
        selector: test.name,
        found: elements,
        status: success ? "✅" : "❌",
        required: test.required,
      });

      console.log(
        `[Health Check] ${test.name}: ${success ? "✅" : "❌"} (${elements} elementos)`,
      );

      if (test.required && !success) {
        console.error(
          `[Health Check] CRÍTICO: Seletor obrigatório "${test.name}" falhou!`,
        );
      }
    } catch (error) {
      results.push({
        selector: test.name,
        found: 0,
        status: "❌",
        required: test.required,
        error: (error as Error).message,
      });

      console.error(
        `[Health Check] Erro ao testar "${test.name}":`,
        (error as Error).message,
      );
    }
  }

  const healthPercent = Math.round(
    (healthScore / criticalSelectors.length) * 100,
  );
  console.log(
    `[Health Check] Score: ${healthScore}/${criticalSelectors.length} (${healthPercent}%)`,
  );

  // Check if critical selectors are working
  const criticalFailures = results.filter(
    (r) => r.required && r.status === "❌",
  );
  if (criticalFailures.length > 0) {
    console.error(
      "[Health Check] ❌ FALHA: Seletores críticos não funcionando",
    );
    return false;
  }

  if (healthPercent >= 70) {
    console.log("[Health Check] ✅ Seletores saudáveis");
    return true;
  } else {
    console.warn(
      "[Health Check] ⚠️ Seletores degradados - considere atualização",
    );
    return false;
  }
}

// CLI Interface
if (require.main === module) {
  async function main() {
    const { getTestIds } = await import("./helpers/getTestIds");

    let userId = process.argv[2];
    let accountId = process.argv[3];
    const groupUrl =
      process.argv[4] || "https://www.facebook.com/groups/tomorandosozinhoeagoraof";
    const headless = process.argv.includes("--headless");
    const maxPosts = parseInt(
      process.argv
        .find((arg) => arg.startsWith("--max-posts="))
        ?.split("=")[1] || "5",
    );

    // Auto discovery
    if (!userId || !accountId || userId === "auto" || accountId === "auto") {
      console.log("🔄 Buscando IDs automaticamente...");
      const testIds = await getTestIds();

      if (!testIds) {
        console.error("❌ Não foi possível obter IDs de teste");
        process.exit(1);
      }

      userId = testIds.userId;
      accountId = testIds.accountId;
      console.log(
        `✅ Usando conta: ${testIds.accountName} (${testIds.status})`,
      );
    }

    try {
      await testSelectors({
        userId,
        accountId,
        groupUrl,
        headless,
        maxPosts,
      });
      console.log("✅ Teste standalone concluído com sucesso");
      process.exit(0);
    } catch (err) {
      console.error("❌ Erro no teste standalone:", err);
      process.exit(1);
    }
  }

  main().catch((err) => {
    console.error("💥 Erro fatal:", err);
    process.exit(1);
  });
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
  } = options;

  if (!groupUrl) throw new Error("groupUrl é obrigatória");

  console.log(`[selectorTester] 🚀 Iniciando teste robusto de seletores`);
  console.log(`[selectorTester] Grupo: ${groupUrl}`);
  console.log(`[selectorTester] Conta: ${accountId}`);
  console.log(
    `[selectorTester] Meta: ${maxPosts} posts, max ${maxScrolls} scrolls`,
  );

  // Usar o contexto oficial do projeto
  const context = await openContextForAccount(userId, accountId, headless);
  const page = await context.newPage();

  try {
    await page.goto(groupUrl, { waitUntil: "domcontentloaded" });
    await ensureLoggedIn(page, groupUrl);

    // Run health check first (following document recommendations)
    console.log(`[selectorTester] 🏥 Executando health check dos seletores...`);
    const healthCheck = await runSelectorHealthCheck(page);

    if (!healthCheck) {
      console.warn(
        `[selectorTester] ⚠️ Health check falhou - seletores podem estar desatualizados`,
      );
      console.warn(
        `[selectorTester] Continuando teste, mas resultados podem ser limitados...`,
      );
    } else {
      console.log(
        `[selectorTester] ✅ Health check passou - seletores funcionando corretamente`,
      );
    }

    // If health check only mode, return early
    if (options.healthCheckOnly) {
      console.log(`[selectorTester] 🏥 Modo health check apenas - finalizando`);
      return;
    }

    const seen = new Set<string>();
    let processed = 0;
    let scrolls = 0;
    let shouldStop = false;

    while (processed < maxPosts && scrolls < maxScrolls && !shouldStop) {
      // Verificar se estamos na página correta
      const currentUrl = page.url();
      if (!currentUrl.includes("/groups/")) {
        console.log(
          `[selectorTester] ⚠️ Não está na página do grupo. URL atual: ${currentUrl}`,
        );
        await page.goto(groupUrl, { waitUntil: "domcontentloaded" });
        await ensureLoggedIn(page, groupUrl);
        continue;
      }

      // STEP 1: Use aria-posinset as primary anchor (following document strategy)
      const allPosinsetElements = await page
        .locator("div[aria-posinset]")
        .all();
      console.log(
        `[selectorTester] Descobertos ${allPosinsetElements.length} elementos com aria-posinset (scroll ${scrolls})`,
      );

      let processedInThisCycle = 0;

      // Process all visible posts with aria-posinset
      for (const posinsetElement of allPosinsetElements) {
        if (processed >= maxPosts) break;

        const posinsetValue =
          await posinsetElement.getAttribute("aria-posinset");
        if (!posinsetValue || seen.has(posinsetValue)) {
          continue; // Skip already processed posts
        }

        console.log(
          `[selectorTester] 🎯 Processando post aria-posinset="${posinsetValue}" (${processed + 1}/${maxPosts})`,
        );

        // Mark as seen immediately to prevent reprocessing
        seen.add(posinsetValue);

        try {
          // Ensure post is visible
          await posinsetElement.scrollIntoViewIfNeeded();
          await sleep(300);

          // Use new robust parsing function directly on the locator (feed-only mode)
          console.log(`[selectorTester] MODO FEED-ONLY - extraindo dados sem abrir modais`);
          const data = await parsePost(posinsetElement);
          const payload = { ...data, groupUrl };

          console.log(`[selectorTester] ✅ Post ${posinsetValue} extraído:`, {
            id: payload.postId,
            author: payload.authorName,
            textLength: payload.text?.length || 0,
            fullText: payload.text || 'NO TEXT',
            images: payload.imageUrls?.length || 0,
            videos: payload.videoUrls?.length || 0,
            links: payload.externalLinks?.length || 0,
            externalLinks: payload.externalLinks?.map(link => `${link.domain}: ${link.text}`) || []
          });

          // Send to webhook if configured
          if (webhookUrl && payload.postId) {
            try {
              console.log(`[selectorTester] Enviando para webhook...`);
              const n8nResponse = await processPostWithN8n(payload, webhookUrl);

              if (n8nResponse.shouldComment && n8nResponse.commentText) {
                console.log(
                  `[selectorTester] N8n solicitou comentário - PULANDO para manter modo feed-only`,
                );
              } else {
                console.log(
                  `[selectorTester] N8n decidiu não comentar neste post`,
                );
              }
            } catch (err) {
              console.warn(
                `[selectorTester] Erro no processamento webhook para post ${payload.postId}:`,
                (err as Error).message,
              );
            }
          }

          processed++;
          processedInThisCycle++;
          console.log(
            `[selectorTester] ✅ Post ${posinsetValue} processado com sucesso! Total: ${processed}`,
          );

          // Pause between posts
          await sleep(rand(...pauseBetweenPostsMs));
        } catch (error) {
          console.error(
            `[selectorTester] ❌ Erro ao processar post ${posinsetValue}:`,
            (error as Error).message,
          );
          // Continue with next post instead of stopping
        }
      }

      // Check if we should continue
      if (processed >= maxPosts) {
        console.log(`[selectorTester] 🎯 Meta de ${maxPosts} posts alcançada!`);
        break;
      }

      if (processedInThisCycle === 0) {
        scrolls++;
        console.log(
          `[selectorTester] Scroll ${scrolls}/${maxScrolls} - Nenhum post novo processado, carregando mais...`,
        );

        // STEP 2: Intelligent scrolling (following document strategy)
        // Find the highest aria-posinset value processed so far
        const processedNumbers = Array.from(seen)
          .map((id) => parseInt(id))
          .filter((n) => !isNaN(n));
        const maxProcessed = Math.max(...processedNumbers);

        if (maxProcessed > 0) {
          // Wait for next sequential post to appear
          console.log(
            `[selectorTester] Aguardando post aria-posinset="${maxProcessed + 1}" aparecer...`,
          );

          // Gentle scroll to load more content
          await page.evaluate(() =>
            window.scrollBy(0, window.innerHeight * 0.6),
          );

          // Wait for new content to load
          try {
            await page
              .locator(`div[aria-posinset="${maxProcessed + 1}"]`)
              .waitFor({
                state: "visible",
                timeout: 5000,
              });
            console.log(
              `[selectorTester] ✅ Próximo post encontrado: aria-posinset="${maxProcessed + 1}"`,
            );
          } catch (e) {
            console.log(
              `[selectorTester] ⏳ Próximo post não apareceu, continuando...`,
            );
            await sleep(2000); // Wait a bit more for dynamic loading
          }
        } else {
          // Fallback scroll if no processed posts yet
          await page.evaluate(() =>
            window.scrollBy(0, window.innerHeight * 0.6),
          );
          await sleep(2000);
        }

        // Check if we've reached the end
        if (scrolls >= maxScrolls) {
          console.log(
            `[selectorTester] 🛑 Limite de scrolls (${maxScrolls}) atingido`,
          );
          break;
        }
      } else {
        // Reset for next iteration
        console.log(`[selectorTester] Continue to next scroll iteration...`);
      }
    }

    console.log(
      `[selectorTester] ✅ Finalizado. Posts processados: ${processed}, posts únicos encontrados: ${seen.size}`,
    );
  } finally {
    await context.close();
  }
}

async function sendToWebhook(
  data: PostData & { groupUrl: string },
  webhookUrl: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "N/A");
      throw new Error(
        `Webhook respondeu com status ${res.status}. Body: ${errorBody}`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Timeout: Webhook não respondeu em 15 segundos.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}