
#!/usr/bin/env node

import { RealTimeProcessor, RealTimeProcessorOptions } from './RealTimeProcessor';
import { getTestIds } from '../../../test/automations/facebook/helpers/getTestIds';

// =============================================================================
// CLI INTERFACE
// =============================================================================

async function main() {
  console.log('🚀 FACEBOOK REAL-TIME PROCESSOR');
  console.log('================================\n');

  // Obter IDs de teste
  const testIds = await getTestIds();
  if (!testIds) {
    console.error("❌ Não foi possível obter IDs de teste. Verifique a configuração.");
    process.exit(1);
  }

  // Configurações via argumentos ou padrões
  const groupUrl = process.argv[2] || "https://www.facebook.com/groups/940840924057399";
  const commentMessage = process.argv[3] || "Interessante! 👍";
  const webhookUrl = process.argv[4] || process.env.WEBHOOK_URL;
  const headless = process.argv.includes('--headless');

  const options: RealTimeProcessorOptions = {
    userId: testIds.userId,
    accountId: testIds.accountId,
    groupUrl,
    workflowId: `realtime-${Date.now()}`,
    nodeId: `node-${Date.now()}`,
    prompt: "Processamento em tempo real de posts do Facebook",
    webhookUrl,
    headless,
    commentMessage,
    maxQueueSize: 50,
    processingDelay: [3000, 6000]
  };

  console.log('📋 Configurações:');
  console.log(`   • Grupo: ${groupUrl}`);
  console.log(`   • Comentário: "${commentMessage}"`);
  console.log(`   • Headless: ${headless}`);
  console.log(`   • Webhook: ${webhookUrl ? 'Configurado' : 'Não configurado'}`);
  console.log('');

  const processor = new RealTimeProcessor(options);

  // Event listeners para monitoramento
  processor.on('postExtracted', (post) => {
    console.log(`📥 [QUEUE] Post adicionado: ${post.authorName} - ${post.postId}`);
  });

  processor.on('postProcessed', ({ post, result }) => {
    console.log(`✅ [PROCESSED] Post comentado: ${post.postId}`);
  });

  processor.on('postFailed', ({ post, result }) => {
    console.log(`❌ [FAILED] Falha ao processar: ${post.postId} - ${result.error}`);
  });

  processor.on('queueUpdated', (stats) => {
    if (stats.queueSize % 5 === 0 || stats.queueSize === 0) { // Log a cada 5 posts ou quando vazio
      console.log(`📊 [STATS] Extraídos: ${stats.extracted} | Processados: ${stats.processed} | Fila: ${stats.queueSize} | Falhas: ${stats.failed}`);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Recebido SIGINT, parando processamento...');
    await processor.stop();
    
    const finalStats = processor.getStats();
    console.log('\n📊 ESTATÍSTICAS FINAIS:');
    console.log('========================');
    console.log(`Posts extraídos: ${finalStats.extracted}`);
    console.log(`Posts processados: ${finalStats.processed}`);
    console.log(`Posts com falha: ${finalStats.failed}`);
    console.log(`Posts na fila: ${finalStats.queueSize}`);
    console.log(`Tempo de execução: ${new Date().toISOString()}`);
    
    process.exit(0);
  });

  try {
    await processor.start();
  } catch (error) {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('💥 Erro no main:', err);
    process.exit(1);
  });
}

export { main };
