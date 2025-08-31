
import { EventEmitter } from 'events';
import { BrowserContext, Page } from 'playwright';
import { openContextForAccount } from '../session/context';
import { testSelectors, PostData, SelectorTestOptions } from '../../../../test/automations/facebook/selectorTester';
import { processPosts, PostProcessorOptions, ProcessedPostResult } from '../../../../test/automations/facebook/postProcessor';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface RealTimeProcessorOptions {
  userId: string;
  accountId: string;
  groupUrl: string;
  workflowId: string;
  nodeId: string;
  prompt: string;
  webhookUrl?: string;
  headless?: boolean;
  commentMessage?: string;
  extractorOptions?: Partial<SelectorTestOptions>;
  processorOptions?: Partial<PostProcessorOptions>;
  maxQueueSize?: number;
  processingDelay?: [number, number];
}

export interface QueuedPost extends PostData {
  groupUrl: string;
  queuedAt: string;
  processed: boolean;
}

export interface ProcessingStats {
  extracted: number;
  processed: number;
  failed: number;
  queueSize: number;
  isExtracting: boolean;
  isProcessing: boolean;
  startTime: string;
}

// =============================================================================
// REAL-TIME PROCESSOR CLASS
// =============================================================================

export class RealTimeProcessor extends EventEmitter {
  private options: RealTimeProcessorOptions;
  private postQueue: QueuedPost[] = [];
  private isExtracting = false;
  private isProcessing = false;
  private processedHashes = new Set<string>();
  private stats: ProcessingStats;
  private extractorContext?: BrowserContext;
  private processorContext?: BrowserContext;

  constructor(options: RealTimeProcessorOptions) {
    super();
    this.options = options;
    this.stats = {
      extracted: 0,
      processed: 0,
      failed: 0,
      queueSize: 0,
      isExtracting: false,
      isProcessing: false,
      startTime: new Date().toISOString()
    };
  }

  // =============================================================================
  // EXTRACTOR LOGIC (REAL-TIME)
  // =============================================================================

  private async startExtractor(): Promise<void> {
    console.log('[RealTimeProcessor] 🔍 Iniciando extrator em tempo real...');
    this.isExtracting = true;
    this.stats.isExtracting = true;

    try {
      this.extractorContext = await openContextForAccount(
        this.options.userId, 
        this.options.accountId, 
        this.options.headless
      );

      const page = await this.extractorContext.newPage();
      await page.goto(this.options.groupUrl, { waitUntil: 'domcontentloaded' });

      // Aguardar login se necessário
      await this.ensureLoggedIn(page);

      const processedPosts = new Set<string>();
      let scrollCount = 0;
      const maxScrolls = 50;

      while (this.isExtracting && scrollCount < maxScrolls) {
        try {
          await this.detectAndCloseModal(page);

          const postsOnPage = await page.locator("div[aria-posinset]").all();
          let newPostsFound = 0;

          for (const postElement of postsOnPage) {
            if (!this.isExtracting) break;

            const posinsetValue = await postElement.getAttribute("aria-posinset");
            if (!posinsetValue || processedPosts.has(posinsetValue)) continue;

            processedPosts.add(posinsetValue);

            try {
              await postElement.scrollIntoViewIfNeeded();
              await this.sleep(300);

              const extractedData = await this.parsePost(postElement);

              if (extractedData.postId) {
                const queuedPost: QueuedPost = {
                  ...extractedData,
                  groupUrl: this.options.groupUrl,
                  queuedAt: new Date().toISOString(),
                  processed: false
                };

                // Verificar se já foi processado
                const hash = this.generatePostHash(queuedPost);
                if (!this.processedHashes.has(hash)) {
                  await this.addToQueue(queuedPost);
                  newPostsFound++;
                  this.stats.extracted++;
                  
                  console.log(`[Extractor] ✅ Post extraído: ${extractedData.authorName} - ${extractedData.postId}`);
                  this.emit('postExtracted', queuedPost);
                }
              }

              await this.sleep(this.rand(500, 1000));
            } catch (error) {
              console.error(`[Extractor] ❌ Erro ao extrair post ${posinsetValue}:`, error);
            }
          }

          if (newPostsFound === 0) {
            scrollCount++;
            console.log(`[Extractor] 📜 Scroll ${scrollCount}/${maxScrolls} - Carregando mais posts...`);
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
            await this.sleep(3000);
          } else {
            scrollCount = 0; // Reset se encontrou posts
            await this.sleep(2000);
          }

        } catch (error) {
          console.error('[Extractor] ❌ Erro no loop de extração:', error);
          await this.sleep(5000);
        }
      }

    } catch (error) {
      console.error('[Extractor] ❌ Erro fatal:', error);
      this.emit('extractorError', error);
    } finally {
      this.isExtracting = false;
      this.stats.isExtracting = false;
      if (this.extractorContext) {
        await this.extractorContext.close();
      }
      console.log('[Extractor] 🏁 Extrator finalizado');
    }
  }

  // =============================================================================
  // PROCESSOR LOGIC (SEQUENTIAL)
  // =============================================================================

  private async startProcessor(): Promise<void> {
    console.log('[RealTimeProcessor] 🤖 Iniciando processador sequencial...');
    this.isProcessing = true;
    this.stats.isProcessing = true;

    try {
      this.processorContext = await openContextForAccount(
        this.options.userId, 
        this.options.accountId, 
        this.options.headless
      );

      while (this.isProcessing || this.postQueue.length > 0) {
        const post = await this.getNextPostToProcess();
        
        if (!post) {
          await this.sleep(2000); // Aguardar novos posts
          continue;
        }

        try {
          console.log(`[Processor] 🔄 Processando post: ${post.postId} (fila: ${this.postQueue.length})`);
          
          const result = await this.processPost(post);
          
          if (result.success) {
            this.stats.processed++;
            const hash = this.generatePostHash(post);
            this.processedHashes.add(hash);
            console.log(`[Processor] ✅ Post processado com sucesso: ${post.postId}`);
            this.emit('postProcessed', { post, result });
          } else {
            this.stats.failed++;
            console.error(`[Processor] ❌ Falha ao processar post ${post.postId}:`, result.error);
            this.emit('postFailed', { post, result });
          }

          // Pausa entre processamentos
          const delay = this.options.processingDelay || [3000, 6000];
          await this.sleep(this.rand(...delay));

        } catch (error) {
          this.stats.failed++;
          console.error(`[Processor] ❌ Erro ao processar post ${post.postId}:`, error);
          this.emit('postError', { post, error });
        }
      }

    } catch (error) {
      console.error('[Processor] ❌ Erro fatal no processador:', error);
      this.emit('processorError', error);
    } finally {
      this.isProcessing = false;
      this.stats.isProcessing = false;
      if (this.processorContext) {
        await this.processorContext.close();
      }
      console.log('[Processor] 🏁 Processador finalizado');
    }
  }

  // =============================================================================
  // QUEUE MANAGEMENT
  // =============================================================================

  private async addToQueue(post: QueuedPost): Promise<void> {
    const maxQueueSize = this.options.maxQueueSize || 100;
    
    if (this.postQueue.length >= maxQueueSize) {
      console.warn(`[Queue] ⚠️ Fila cheia (${maxQueueSize}), removendo post mais antigo`);
      this.postQueue.shift();
    }

    this.postQueue.push(post);
    this.stats.queueSize = this.postQueue.length;
    this.emit('queueUpdated', this.stats);
  }

  private async getNextPostToProcess(): Promise<QueuedPost | null> {
    const post = this.postQueue.shift();
    if (post) {
      this.stats.queueSize = this.postQueue.length;
      this.emit('queueUpdated', this.stats);
    }
    return post || null;
  }

  // =============================================================================
  // INDIVIDUAL POST PROCESSING
  // =============================================================================

  private async processPost(post: QueuedPost): Promise<ProcessedPostResult> {
    const page = await this.processorContext!.newPage();
    
    try {
      console.log(`[processPost] 🔗 Abrindo permalink: ${post.permalink}`);
      await page.goto(post.permalink!, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      await this.sleep(4000);

      // Aguardar dialog do post
      const postDialogSelector = 'div[role="dialog"][aria-labelledby]';
      const postDialog = page.locator(postDialogSelector).first();
      await postDialog.waitFor({ state: 'visible', timeout: 25000 });

      // Encontrar caixa de comentário
      const commentBoxSelector = 'div[role="textbox"][contenteditable="true"]';
      const commentBox = postDialog.locator(commentBoxSelector).first();
      await commentBox.waitFor({ state: 'visible', timeout: 15000 });

      // Postar comentário
      await commentBox.click({ force: true, timeout: 5000 });
      await this.sleep(this.rand(500, 1000));

      const message = this.options.commentMessage || "Interessante! 👍";
      await commentBox.fill(message);
      await this.sleep(this.rand(500, 1000));

      await page.keyboard.press('Enter');
      await this.sleep(4000);

      return {
        postId: post.postId!,
        permalink: post.permalink!,
        success: true,
        alreadyProcessed: false,
        commentPosted: true,
        hash: this.generatePostHash(post)
      };

    } catch (error) {
      return {
        postId: post.postId!,
        permalink: post.permalink!,
        success: false,
        alreadyProcessed: false,
        commentPosted: false,
        hash: this.generatePostHash(post),
        error: (error as Error).message
      };
    } finally {
      await page.close();
    }
  }

  // =============================================================================
  // PUBLIC METHODS
  // =============================================================================

  public async start(): Promise<void> {
    console.log('[RealTimeProcessor] 🚀 Iniciando processamento em tempo real...');
    
    // Iniciar extrator e processador em paralelo
    const extractorPromise = this.startExtractor();
    const processorPromise = this.startProcessor();

    // Aguardar ambos finalizarem
    await Promise.allSettled([extractorPromise, processorPromise]);
    
    console.log('[RealTimeProcessor] 🏁 Processamento finalizado');
  }

  public async stop(): Promise<void> {
    console.log('[RealTimeProcessor] 🛑 Parando processamento...');
    this.isExtracting = false;
    this.isProcessing = false;
    
    // Aguardar um pouco para finalizar processamentos em andamento
    await this.sleep(5000);
    
    if (this.extractorContext) {
      await this.extractorContext.close();
    }
    if (this.processorContext) {
      await this.processorContext.close();
    }
  }

  public getStats(): ProcessingStats {
    return { ...this.stats };
  }

  public getQueueSize(): number {
    return this.postQueue.length;
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private generatePostHash(post: QueuedPost): string {
    const content = `${post.permalink}|${post.authorName}|${post.text?.substring(0, 200)}`;
    return require('crypto').createHash('md5').update(content).digest('hex');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Métodos auxiliares copiados do selectorTester
  private async ensureLoggedIn(page: Page): Promise<void> {
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
      await page.waitForURL((url) => url.href.startsWith(this.options.groupUrl), { timeout: 180000 });
      await page.locator('div[role="feed"]').first().waitFor({ state: "visible", timeout: 30000 });
      console.log(">> Login completo e feed carregado.");
    }
  }

  private async detectAndCloseModal(page: Page): Promise<boolean> {
    const modalSelector = 'div[role="dialog"], div[aria-modal="true"]';
    const modal = page.locator(modalSelector).first();

    if (await modal.isVisible({ timeout: 500 })) {
      console.log("[detectAndCloseModal] Modal detectado.");
      await page.keyboard.press("Escape").catch(e => console.warn("Falha ao pressionar ESC", e));
      await this.sleep(1000);
      return true;
    }
    return false;
  }

  private async parsePost(postLocator: any): Promise<PostData> {
    // Implementação simplificada do parsePost do selectorTester
    const localPostId = (await postLocator.getAttribute("aria-posinset")) || "unknown";
    
    const data: PostData = {
      postId: null, permalink: null, authorName: null, authorUrl: null,
      timeISO: null, timeText: null, text: null, imageUrls: [],
      videoUrls: [], externalLinks: []
    };

    // Extrair permalink
    try {
      const timestampSelector = 'a[href*="/posts/"], a[href*="/permalink/"]';
      const linkElements = await postLocator.locator(timestampSelector).all();
      
      for (const linkElement of linkElements) {
        const href = await linkElement.getAttribute("href");
        if (href && !href.includes("comment_id")) {
          const fullUrl = href.startsWith("http") ? href : `https://www.facebook.com${href}`;
          const postIdMatch = fullUrl.match(/\/posts\/(\d+)|\/permalink\/(\d+)/);
          if (postIdMatch) {
            data.permalink = fullUrl;
            data.postId = postIdMatch[1] || postIdMatch[2];
            break;
          }
        }
      }
    } catch (e) {
      console.log(`[parsePost] Erro ao extrair permalink: ${e}`);
    }

    // Extrair autor
    try {
      const authorSelector = 'h2 a, h3 a, [data-ad-rendering-role="profile_name"] a';
      const authorLocator = postLocator.locator(authorSelector).first();
      if (await authorLocator.isVisible({ timeout: 500 })) {
        data.authorName = (await authorLocator.innerText()).trim();
        data.authorUrl = await authorLocator.getAttribute("href");
      }
    } catch (e) {
      console.log(`[parsePost] Erro ao extrair autor: ${e}`);
    }

    // Extrair texto
    try {
      const textSelector = '[data-ad-preview="message"], [data-testid="post_message"]';
      const textLocator = postLocator.locator(textSelector).first();
      if (await textLocator.isVisible({ timeout: 500 })) {
        data.text = (await textLocator.innerText()).trim();
      }
    } catch (e) {
      console.log(`[parsePost] Erro ao extrair texto: ${e}`);
    }

    return data;
  }
}
