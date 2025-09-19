
import { BrowserContext, Page } from "playwright";
import { openContextForAccount } from "../../../src/core/automations/facebook/session/context";

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
export async function runPostProcessing(options: PostProcessorOptions): Promise<ProcessedPostResult> {
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
