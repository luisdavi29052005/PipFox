import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { startRunner, WorkflowConfig } from '../core/automations/facebook/runner';
import { postComment } from '../core/automations/facebook/actions/postComment';
import { openContextForAccount } from '../core/automations/facebook/session/context';
import { supabase } from '../services/supabaseClient';

const connection = new IORedis({ 
  maxRetriesPerRequest: null,
  lazyConnect: true,
  keepAlive: 30000
});

console.log('🚀 Worker de Workflows iniciado...');
console.log('HEADLESS mode:', process.env.HEADLESS !== 'false');

// Worker para processar jobs de workflow
const workflowWorker = new Worker('workflowQueue', async (job) => {
  console.log(`[worker] Processando job ${job.name} (ID: ${job.id})`);

  try {
    // Verifica se é um job de iniciar workflow
    if (job.name.startsWith('start-workflow-')) {
      const { workflowId, userId, accountId } = job.data;
      
      console.log(`[worker] Iniciando workflow ${workflowId} para conta ${accountId}`);
      
      // Busca os dados do workflow no banco
      const { data: workflow, error: workflowError } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (workflowError || !workflow) {
        throw new Error(`Workflow não encontrado: ${workflowId}`);
      }

      // Busca os nodes do workflow
      const { data: nodes, error: nodesError } = await supabase
        .from('workflow_nodes')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('is_active', true);

      if (nodesError || !nodes || nodes.length === 0) {
        throw new Error(`Nenhum node ativo encontrado para o workflow: ${workflowId}`);
      }

      // Atualiza status para running
      await supabase
        .from('workflows')
        .update({ status: 'running' })
        .eq('id', workflowId);

      // Configura o workflow
      const config: WorkflowConfig = {
        id: workflowId,
        account_id: accountId,
        user_id: userId,
        webhook_url: workflow.webhook_url,
        nodes: nodes.map(node => ({
          group_url: node.group_url
        }))
      };

      // Inicia o runner
      await startRunner(config);
      
      console.log(`[worker] Workflow ${workflowId} iniciado com sucesso`);
      
    } else if (job.name === 'post-comment') {
      // Job para postar comentário
      const { accountId, userId, postUrl, comment } = job.data;
      await postComment({ accountId, userId, postUrl, comment });
      
    } else {
      throw new Error(`Tipo de job desconhecido: ${job.name}`);
    }

  } catch (error) {
    console.error(`Job ${job.id} (tipo: ${job.name}) falhou com o erro:`, error);
    
    // Se for um job de workflow, atualiza o status para error
    if (job.name.startsWith('start-workflow-')) {
      const { workflowId } = job.data;
      await supabase
        .from('workflows')
        .update({ status: 'error' })
        .eq('id', workflowId);
    }
    
    throw error;
  }
}, { 
  connection,
  concurrency: 5,
  maxStalledCount: 1,
  stalledInterval: 30 * 1000,
  maxmemoryPolicy: 'allkeys-lru'
});

workflowWorker.on('completed', (job) => {
  console.log(`[worker] ✅ Job ${job.id} completado: ${job.name}`);
});

workflowWorker.on('failed', (job, err) => {
  if (job) {
    console.error(`[worker] ❌ Job ${job.id} (${job.name}) falhou:`, err.message);
  } else {
    console.error('[worker] ❌ Job failed:', err.message);
  }
});

workflowWorker.on('error', (err) => {
  // Ignora erros relacionados à chave de jobs concluídos
  if (err.message.includes('Missing key for job') && err.message.includes('moveToDelayed')) {
    console.log('[worker] ℹ️ Job finalizado com sucesso (ignorando erro de cleanup)');
    return;
  }
  console.error('[worker] Erro no worker:', err.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[worker] Encerrando worker...');
  await workflowWorker.close();
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[worker] Encerrando worker...');
  await workflowWorker.close();
  await connection.quit();
  process.exit(0);
});
