import { BrowserContext, Page } from "playwright";
import { openContextForAccount } from "../../../src/core/automations/facebook/session/context";
import { getTestIds } from "./helpers/getTestIds";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface PostProcessorOptions {
  userId: string;
  accountId: string;
  workflowId: string;
  nodeId: string;
  prompt: string;
  posts: Array<{
    postId: string;
    permalink: string;
    authorName: string | null;
    text: string | null;
    imageUrls: string[];
    videoUrls?: string[];
    externalLinks?: Array<{ url: string; text: string; domain: string }>;
  }>;
  webhookUrl?: string;
  headless?: boolean;
  commentMessage?: string;
  pauseBetweenPostsMs?: [number, number];
  processedHashesFile?: string;
}

export interface ProcessedPostResult {
  postId: string;
  permalink: string;
  success: boolean;
  alreadyProcessed: boolean;
  error?: string;
  commentPosted: boolean;
  hash: string;
}

export interface ProcessorResult {
  meta: {
    userId: string;
    accountId: string;
    workflowId: string;
    nodeId: string;
    prompt: string;
    totalPosts: number;
    processedCount: number;
    successCount: number;
    skippedCount: number;
    timestamp: string;
  };
  results: ProcessedPostResult[];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Gera um hash único para um post baseado no permalink
 */
function generatePostHash(permalink: string): string {
  return crypto.createHash('md5').update(permalink).digest('hex');
}

/**
 * Carrega hashes de posts já processados
 */
function loadProcessedHashes(filePath: string): Set<string> {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const hashes = JSON.parse(data);
      return new Set(hashes);
    }
  } catch (error) {
    console.warn('[loadProcessedHashes] Erro ao carregar hashes:', error);
  }
  return new Set();
}

/**
 * Salva hashes de posts processados
 */
function saveProcessedHashes(filePath: string, hashes: Set<string>): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(Array.from(hashes), null, 2));
  } catch (error) {
    console.error('[saveProcessedHashes] Erro ao salvar hashes:', error);
  }
}

/**
 * Envia dados para webhook N8n
 */
async function sendToN8n(webhookUrl: string, data: any): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('[sendToN8n] ✅ Dados enviados para N8n com sucesso');
  } catch (error) {
    console.error('[sendToN8n] ❌ Erro ao enviar para N8n:', (error as Error).message);
    throw error;
  }
}

/**
 * Detecta e fecha modais que possam aparecer
 */
async function detectAndCloseModal(page: Page): Promise<boolean> {
  const modalSelector = 'div[role="dialog"][aria-labelledby]'; // Mais específico para o dialog do post
  const modal = page.locator(modalSelector).first();

  if (await modal.isVisible({ timeout: 1500 })) {
    console.log('[detectAndCloseModal] Modal do post detectado.');
    return true;
  }
  return false;
}

/**
 * Processa um único post
 */
async function processPost(
  page: Page,
  post: any,
  commentMessage: string,
  alreadyProcessed: boolean
): Promise<ProcessedPostResult> {
  const hash = generatePostHash(post.permalink);

  const result: ProcessedPostResult = {
    postId: post.postId,
    permalink: post.permalink,
    success: false,
    alreadyProcessed,
    commentPosted: false,
    hash
  };

  if (alreadyProcessed) {
    console.log(`[processPost] ⏭️ Post ${post.postId} já foi processado, pulando...`);
    result.success = true;
    return result;
  }

  try {
    console.log(`[processPost] 🔗 Abrindo permalink: ${post.permalink}`);
    await page.goto(post.permalink, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
    });
    await sleep(4000); // Dar um tempo extra para o JavaScript do Facebook carregar o modal

    // **CORREÇÃO DEFINITIVA**: Focar no dialog do post que abre
    const postDialogSelector = 'div[role="dialog"][aria-labelledby]';
    console.log(`[processPost] 🔍 Aguardando o dialog do post aparecer...`);
    const postDialog = page.locator(postDialogSelector).first();
    await postDialog.waitFor({ state: 'visible', timeout: 25000 });
    console.log('[processPost] ✅ Dialog do post encontrado.');
    
    console.log(`[processPost] 💬 Tentando comentar no post ${post.postId}...`);

    // **CORREÇÃO DEFINITIVA**: Seletor preciso para a caixa de comentário DENTRO do dialog
    const commentBoxSelector = 'div[role="textbox"][contenteditable="true"]';
    
    console.log(`[processPost] 🔍 Procurando pela caixa de comentário DENTRO do dialog.`);
    const commentBox = postDialog.locator(commentBoxSelector).first();
    await commentBox.waitFor({ state: 'visible', timeout: 15000 });
    console.log('[processPost] ✅ Caixa de comentário encontrada.');

    console.log('[processPost] 🖱️ Clicando na caixa de comentário...');
    await commentBox.click({ force: true, timeout: 5000 });
    await sleep(rand(500, 1000));

    console.log(`[processPost] ⌨️ Digitando: "${commentMessage}"`);
    await commentBox.fill(commentMessage);
    await sleep(rand(500, 1000));

    console.log('[processPost] ↩️ Enviando comentário...');
    await page.keyboard.press('Enter');
    
    await sleep(4000); // Espera um tempo maior para o comentário ser processado e visível

    console.log(`[processPost] ✅ Comentário postado com sucesso no post ${post.postId}`);
    result.success = true;
    result.commentPosted = true;

  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error(`[processPost] ❌ Erro ao processar post ${post.postId}:`, errorMessage);
    result.error = errorMessage;
  }

  return result;
}


// =============================================================================
// MAIN PROCESSOR FUNCTION
// =============================================================================

/**
 * Função principal que processa os posts
 */
export async function processPosts(options: PostProcessorOptions): Promise<ProcessorResult> {
  const {
    userId,
    accountId,
    workflowId,
    nodeId,
    prompt,
    posts,
    webhookUrl,
    headless = false,
    commentMessage = "Hi! I’d be happy to help you with this. If you’re still interested, please send me a private message so we can go over the details.",
    pauseBetweenPostsMs = [2000, 4000],
    processedHashesFile = path.join(__dirname, 'output/processed_hashes.json')
  } = options;

  console.log(`🚀 Iniciando processamento de posts`);
  console.log(`   - WorkflowId: ${workflowId}`);
  console.log(`   - NodeId: ${nodeId}`);
  console.log(`   - Total de posts: ${posts.length}`);
  console.log(`   - Mensagem de comentário: "${commentMessage}"`);

  const processedHashes = loadProcessedHashes(processedHashesFile);
  console.log(`   - Posts já processados: ${processedHashes.size}`);

  const result: ProcessorResult = {
    meta: {
      userId,
      accountId,
      workflowId,
      nodeId,
      prompt,
      totalPosts: posts.length,
      processedCount: 0,
      successCount: 0,
      skippedCount: 0,
      timestamp: new Date().toISOString()
    },
    results: []
  };

  const context = await openContextForAccount(userId, accountId, headless);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  try {
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const hash = generatePostHash(post.permalink);
      const alreadyProcessed = processedHashes.has(hash);

      console.log(`\n--- PROCESSANDO POST ${i + 1}/${posts.length} ---`);
      console.log(`Post ID: ${post.postId}`);
      console.log(`Autor: ${post.authorName || 'N/A'}`);
      console.log(`Hash: ${hash}`);

      const postResult = await processPost(page, post, commentMessage, alreadyProcessed);
      result.results.push(postResult);
      result.meta.processedCount++;

      if (postResult.alreadyProcessed) {
        result.meta.skippedCount++;
      } else if (postResult.success) {
        result.meta.successCount++;
        processedHashes.add(hash);
      }

      if (webhookUrl && postResult.success && !postResult.alreadyProcessed) {
        try {
          const n8nPayload = {
            meta: {
              userId,
              accountId,
              workflowId,
              nodeId,
              prompt
            },
            posts: [post]
          };

          await sendToN8n(webhookUrl, n8nPayload);
        } catch (error) {
          console.warn(`[processPosts] ⚠️ Erro ao enviar para N8n: ${(error as Error).message}`);
        }
      }

      console.log(`Status: ${postResult.success ? '✅ SUCESSO' : '❌ FALHA'}`);
      
      // Fechar o modal/dialog do post para evitar sobrecarga
      try {
        await page.keyboard.press("Escape");
        console.log('[processPosts] ⏪ Fechando o post atual...');
        await sleep(1500);
      } catch(e) {
        console.warn('[processPosts] ⚠️ Não foi possível fechar o modal com Escape, continuando...');
      }

      console.log(`--- FIM POST ${i + 1}/${posts.length} ---\n`);

      if (i < posts.length - 1) {
        const pauseMs = rand(...pauseBetweenPostsMs);
        console.log(`⏳ Aguardando ${pauseMs}ms antes do próximo post...`);
        await sleep(pauseMs);
      }
    }

    saveProcessedHashes(processedHashesFile, processedHashes);

  } catch (error) {
    console.error("❌ Erro geral durante o processamento:", error);
  } finally {
    await context.close();

    console.log("\n🎯 RESUMO DO PROCESSAMENTO");
    console.log("================================");
    console.log(`Total de posts: ${result.meta.totalPosts}`);
    console.log(`Processados: ${result.meta.processedCount}`);
    console.log(`Sucessos: ${result.meta.successCount}`);
    console.log(`Pulados (já processados): ${result.meta.skippedCount}`);
    console.log(`Falhas: ${result.meta.processedCount - result.meta.successCount - result.meta.skippedCount}`);
    console.log("================================");

    console.log("✅ Processamento finalizado.");
  }

  return result;
}

// =============================================================================
// CLI INTERFACE
// =============================================================================

if (require.main === module) {
  async function main() {
    const inputFile = process.argv[2];
    const commentMessage = process.argv[3] || "Hi! I’d be happy to help you with this. If you’re still interested, please send me a private message so we can go over the details.";
    const webhookUrl = process.argv[4] || process.env.WEBHOOK_URL;

    if (!inputFile) {
      console.log(`
🔄 PROCESSADOR DE POSTS FACEBOOK
================================

USO:
npx tsx postProcessor.ts <arquivo-json> [mensagem] [webhook-url]

EXEMPLOS:
npx tsx postProcessor.ts output/facebook_posts_2025-01-25T05-43-36-431Z.json
npx tsx postProcessor.ts output/posts.json "Ótima foto! 👏"
npx tsx postProcessor.ts output/posts.json "Legal!" https://hooks.n8n.cloud/webhook/your-id

PARÂMETROS:
- arquivo-json: Arquivo JSON com posts extraídos pelo selectorTester
- mensagem: Mensagem para comentar (opcional, padrão: "Interessante! 👍")
- webhook-url: URL do webhook N8n (opcional, usa WEBHOOK_URL do .env)

O script automaticamente:
✅ Evita processar posts já comentados
✅ Abre cada post individualmente via permalink
✅ Comenta e fecha antes de abrir o próximo
✅ Salva progresso para evitar duplicatas
✅ Envia dados estruturados para N8n
      `);
      process.exit(1);
    }

    let data;
    try {
      const fullPath = path.resolve(inputFile);
      const fileContent = fs.readFileSync(fullPath, 'utf8');
      data = JSON.parse(fileContent);
    } catch (error) {
      console.error("❌ Erro ao carregar arquivo JSON:", (error as Error).message);
      process.exit(1);
    }

    if (!data.meta || !data.posts || !Array.isArray(data.posts)) {
      console.error("❌ Arquivo JSON inválido. Esperado: { meta: {...}, posts: [...] }");
      process.exit(1);
    }

    const testIds = await getTestIds();
    if (!testIds) {
      console.error("❌ Não foi possível obter IDs de teste");
      process.exit(1);
    }

    const options: PostProcessorOptions = {
      userId: data.meta.userId || testIds.userId,
      accountId: data.meta.accountId || testIds.accountId,
      workflowId: data.meta.workflowId || `workflow-${Date.now()}`,
      nodeId: data.meta.nodeId || `node-${Date.now()}`,
      prompt: data.meta.prompt || "Prompt padrão para processamento de posts",
      posts: data.posts,
      webhookUrl,
      headless: process.argv.includes('--headless'),
      commentMessage,
      pauseBetweenPostsMs: [3000, 6000]
    };

    try {
      const result = await processPosts(options);

      const outputDir = path.join(__dirname, 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const resultFile = path.join(outputDir, `processing_result_${timestamp}.json`);
      fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));

      console.log(`\n💾 Resultado salvo em: ${resultFile}`);

      process.exit(result.meta.successCount > 0 ? 0 : 1);
    } catch (err) {
      console.error('💥 Erro fatal:', err);
      process.exit(1);
    }
  }

  main().catch(err => {
    console.error('💥 Erro no main:', err);
    process.exit(1);
  });
}

