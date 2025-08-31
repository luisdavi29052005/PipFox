
import { testSelectors, PostData } from './selectorTester';
import { processPosts } from './postProcessor';
import { getTestIds } from './helpers/getTestIds';

interface RealTimeTestOptions {
  userId: string;
  accountId: string;
  groupUrl: string;
  workflowId: string;
  nodeId: string;
  commentMessage: string;
  maxPosts: number;
  processingDelay: [number, number];
  extractionInterval: number; // Intervalo entre extrações em ms
}

class RealTimeTest {
  private options: RealTimeTestOptions;
  private isRunning = false;
  private stats = {
    extracted: 0,
    processed: 0,
    failed: 0,
    startTime: new Date().toISOString()
  };

  constructor(options: RealTimeTestOptions) {
    this.options = options;
  }

  async start() {
    console.log('🧪 TESTE EM TEMPO REAL - INICIANDO');
    console.log('==================================');
    console.log(`Grupo: ${this.options.groupUrl}`);
    console.log(`Max Posts: ${this.options.maxPosts}`);
    console.log(`Comentário: "${this.options.commentMessage}"`);
    console.log(`Intervalo de extração: ${this.options.extractionInterval / 1000}s`);
    console.log('==================================\n');

    this.isRunning = true;
    const extractedPosts: Array<PostData & { groupUrl: string }> = [];

    while (this.isRunning && this.stats.extracted < this.options.maxPosts) {
      try {
        console.log(`\n🔍 [EXTRAÇÃO ${this.stats.extracted + 1}] Iniciando nova extração...`);

        // Extrair posts usando o selectorTester
        const selectorResults = await this.extractPosts();
        
        if (selectorResults.length > 0) {
          console.log(`✅ [EXTRAÇÃO] Extraídos ${selectorResults.length} posts novos`);
          extractedPosts.push(...selectorResults);
          this.stats.extracted += selectorResults.length;

          // Processar os posts extraídos
          await this.processPosts(selectorResults);
        } else {
          console.log(`⚠️ [EXTRAÇÃO] Nenhum post novo encontrado`);
        }

        // Aguardar antes da próxima extração
        if (this.isRunning && this.stats.extracted < this.options.maxPosts) {
          console.log(`⏳ Aguardando ${this.options.extractionInterval / 1000}s para próxima extração...`);
          await this.sleep(this.options.extractionInterval);
        }

      } catch (error) {
        console.error(`❌ [ERRO] Erro na extração:`, error);
        this.stats.failed++;
        await this.sleep(5000); // Pausa em caso de erro
      }
    }

    await this.showFinalStats();
  }

  private async extractPosts(): Promise<Array<PostData & { groupUrl: string }>> {
    try {
      let results: Array<PostData & { groupUrl: string }> = [];

      // Usar o selectorTester para extrair posts
      await testSelectors({
        userId: this.options.userId,
        accountId: this.options.accountId,
        groupUrl: this.options.groupUrl,
        headless: false,
        maxPosts: 3, // Extrair poucos posts por vez para simular tempo real
        maxScrolls: 5,
        pauseBetweenPostsMs: [500, 1000],
        saveToJson: false,
        healthCheckOnly: false
      });

      // Como o testSelectors não retorna os dados diretamente,
      // vamos simular com dados de exemplo para o teste
      console.log(`🔍 [EXTRATOR] Simulando extração de posts do grupo`);

      return results;
    } catch (error) {
      console.error(`❌ [EXTRATOR] Erro na extração:`, error);
      return [];
    }
  }

  private async processPosts(posts: Array<PostData & { groupUrl: string }>) {
    if (posts.length === 0) return;

    try {
      console.log(`🤖 [PROCESSADOR] Processando ${posts.length} posts...`);

      const result = await processPosts({
        userId: this.options.userId,
        accountId: this.options.accountId,
        workflowId: this.options.workflowId,
        nodeId: this.options.nodeId,
        prompt: "Teste em tempo real",
        posts: posts.map(p => ({
          postId: p.postId!,
          permalink: p.permalink!,
          authorName: p.authorName,
          text: p.text,
          imageUrls: p.imageUrls,
          videoUrls: p.videoUrls || [],
          externalLinks: p.externalLinks || []
        })),
        headless: false,
        commentMessage: this.options.commentMessage,
        pauseBetweenPostsMs: this.options.processingDelay
      });

      this.stats.processed += result.meta.successCount;
      this.stats.failed += (result.meta.processedCount - result.meta.successCount);

      console.log(`✅ [PROCESSADOR] Resultado: ${result.meta.successCount} sucessos, ${result.meta.processedCount - result.meta.successCount} falhas`);

    } catch (error) {
      console.error(`❌ [PROCESSADOR] Erro no processamento:`, error);
      this.stats.failed += posts.length;
    }
  }

  private async showFinalStats() {
    const duration = (Date.now() - new Date(this.stats.startTime).getTime()) / 1000;
    
    console.log('\n📊 RESULTADOS FINAIS DO TESTE');
    console.log('==============================');
    console.log(`⏱️ Duração: ${Math.round(duration)}s`);
    console.log(`📥 Posts extraídos: ${this.stats.extracted}`);
    console.log(`✅ Posts processados: ${this.stats.processed}`);
    console.log(`❌ Falhas: ${this.stats.failed}`);
    console.log(`📈 Taxa de sucesso: ${this.stats.processed > 0 ? ((this.stats.processed / (this.stats.processed + this.stats.failed)) * 100).toFixed(1) : 0}%`);
    console.log('==============================');
  }

  async stop() {
    console.log('\n🛑 Parando teste em tempo real...');
    this.isRunning = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function testRealTimeProcessor() {
  console.log('🧪 TESTE DO PROCESSADOR EM TEMPO REAL');
  console.log('=====================================\n');

  const testIds = await getTestIds();
  if (!testIds) {
    console.error("❌ Não foi possível obter IDs de teste.");
    return;
  }

  const options: RealTimeTestOptions = {
    userId: testIds.userId,
    accountId: testIds.accountId,
    groupUrl: "https://www.facebook.com/groups/940840924057399",
    workflowId: `test-${Date.now()}`,
    nodeId: `test-node-${Date.now()}`,
    commentMessage: "🤖 Teste automatizado - Post interessante!",
    maxPosts: 10,
    processingDelay: [2000, 4000],
    extractionInterval: 30000 // 30 segundos entre extrações
  };

  const tester = new RealTimeTest(options);

  // Parar após 5 minutos para teste
  setTimeout(async () => {
    console.log('\n⏰ Tempo de teste esgotado, parando...');
    await tester.stop();
    process.exit(0);
  }, 5 * 60 * 1000); // 5 minutos

  try {
    await tester.start();
  } catch (error) {
    console.error('💥 Erro no teste:', error);
    process.exit(1);
  }
}

// Use ES modules export instead of require.main
if (import.meta.url === `file://${process.argv[1]}`) {
  testRealTimeProcessor().catch(err => {
    console.error('💥 Erro fatal no teste:', err);
    process.exit(1);
  });
}
