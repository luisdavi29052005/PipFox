import { BrowserContext, Page } from "playwright";
import { openContextForAccount } from "../../../src/core/automations/facebook/session/context";
import { getTestIds } from "./helpers/getTestIds";
import http from 'http';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface PostProcessorOptions {
  userId: string;
  accountId: string;
  headless?: boolean;
  commentMessage: string;
  post: { 
    postId: string;
    permalink: string;
    authorName: string | null;
    text: string | null;
    imageUrls: string[];
  };
}

export interface ProcessedPostResult {
  postId: string;
  permalink: string;
  success: boolean;
  error?: string;
  commentPosted: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;


/**
 * Processa um único post: abre, comenta e fecha.
 */
async function processSinglePost(
  page: Page,
  post: PostProcessorOptions['post'],
  commentMessage: string,
): Promise<ProcessedPostResult> {

  const result: ProcessedPostResult = {
    postId: post.postId,
    permalink: post.permalink,
    success: false,
    commentPosted: false,
  };

  try {
    console.log(`[PROCESSADOR] 🔗 Abrindo permalink: ${post.permalink}`);
    await page.goto(post.permalink, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
    });
    await sleep(4000); 

    const postDialogSelector = 'div[role="dialog"][aria-labelledby]';
    console.log(`[PROCESSADOR] 🔍 Aguardando o dialog do post...`);
    const postDialog = page.locator(postDialogSelector).first();
    await postDialog.waitFor({ state: 'visible', timeout: 25000 });
    console.log('[PROCESSADOR] ✅ Dialog do post encontrado.');
    
    console.log(`[PROCESSADOR] 💬 Tentando comentar no post ${post.postId}...`);

    const commentBoxSelector = 'div[role="textbox"][contenteditable="true"]';
    const commentBox = postDialog.locator(commentBoxSelector).first();
    await commentBox.waitFor({ state: 'visible', timeout: 15000 });
    console.log('[PROCESSADOR] ✅ Caixa de comentário encontrada.');

    await commentBox.click({ force: true, timeout: 5000 });
    await sleep(rand(500, 1000));

    console.log(`[PROCESSADOR] ⌨️ Digitando: "${commentMessage}"`);
    await commentBox.fill(commentMessage);
    await sleep(rand(500, 1000));

    await page.keyboard.press('Enter');
    await sleep(4000); 

    console.log(`[PROCESSADOR] ✅ Comentário postado com sucesso no post ${post.postId}`);
    result.success = true;
    result.commentPosted = true;

  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error(`[PROCESSADOR] ❌ Erro ao processar post ${post.postId}:`, errorMessage);
    result.error = errorMessage;
  }

  return result;
}


/**
 * Função que encapsula a lógica de abrir o navegador e processar o post.
 */
async function runPostProcessing(options: PostProcessorOptions): Promise<ProcessedPostResult> {
    const { userId, accountId, post, commentMessage, headless } = options;
    const context = await openContextForAccount(userId, accountId, headless);
    const page = await context.newPage();
    
    let result: ProcessedPostResult;
    try {
        result = await processSinglePost(page, post, commentMessage);
    } catch (error) {
        console.error(`[MAIN] Erro geral no processamento do post ${post.postId}:`, error);
        result = {
            postId: post.postId,
            permalink: post.permalink,
            success: false,
            commentPosted: false,
            error: (error as Error).message
        };
    } finally {
        await context.close();
        console.log(`[MAIN] ✅ Finalizado o processamento para o post ${post.postId}.`);
    }
    return result;
}

// =============================================================================
// WEB SERVER (para ser acionado pelo n8n)
// =============================================================================

/**
 * Inicia um servidor HTTP para escutar por requisições do n8n.
 */
function startWebhookServer(port: number) {
    const server = http.createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/webhook-processor/start') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', async () => {
                try {
                    const { postData, aiResponse } = JSON.parse(body);
                    
                    console.log(`[SERVER] 📥 Webhook recebido para o post: ${postData.postId}`);

                    if (!aiResponse.shouldReply) {
                        console.log(`[SERVER] 🤖 IA decidiu não responder. Ignorando.`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ message: 'Ação ignorada conforme decisão da IA' }));
                        return;
                    }
                    
                    const testIds = await getTestIds();
                    if (!testIds) {
                        throw new Error("Não foi possível obter IDs de teste");
                    }

                    const options: PostProcessorOptions = {
                        userId: testIds.userId,
                        accountId: testIds.accountId,
                        post: postData,
                        commentMessage: aiResponse.replyMessage,
                        headless: false, // Rodar com interface para ver a ação
                    };

                    // Executa o processamento do post em background (não bloqueia a resposta)
                    runPostProcessing(options).then(result => {
                        console.log(`[SERVER] Resultado do processamento para post ${result.postId}: ${result.success ? 'SUCESSO' : 'FALHA'}`);
                    }).catch(err => {
                        console.error(`[SERVER] Erro não tratado no processamento do post ${postData.postId}:`, err);
                    });

                    // Responde imediatamente ao n8n para não deixá-lo esperando
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: "Processamento iniciado" }));

                } catch (error) {
                    console.error('[SERVER] ❌ Erro ao processar webhook:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: (error as Error).message }));
                }
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Endpoint não encontrado' }));
        }
    });

    server.listen(port, () => {
        console.log(`[PROCESSADOR] 🎧 Servidor iniciado e escutando na porta ${port}`);
        console.log(`[PROCESSADOR] Aguardando chamadas do n8n em http://localhost:${port}/webhook-processor/start`);
        console.log('[PROCESSADOR] Worker está ativo e pronto para receber tarefas.');
    });
}


// =============================================================================
// PONTO DE ENTRADA DO SCRIPT
// =============================================================================

// Inicia o servidor assim que o script é executado.
const PORT = 5679; // Porta diferente do webhook principal do n8n
startWebhookServer(PORT);

