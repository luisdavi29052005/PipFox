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
console.log('HEADLESS mode:', process.env.HEADLESS);

const worker = new Worker('workflow-jobs', async job => {
  console.log(`[worker] Processando job ${job.name} (ID: ${job.id})`);

  // Aceita tanto jobs com nome fixo quanto dinâmico que começam com 'workflow:'
  if (job.name === 'workflow-job' || job.name.startsWith('workflow:')) {
    console.log(`[worker] Executando workflow job: ${job.name}`);
    const config = job.data as WorkflowConfig;
    await startRunner(config);
    return;
  }

  // Se chegou aqui, verifica outros tipos de job
  if (job.name === 'comment-job') {
    const { leadId, postUrl, commentText } = job.data;
    
    // Precisamos buscar a conta associada a este lead para usar o contexto correto
    const { data: leadData, error } = await supabase
      .from('leads')
      .select(`
        node:workflow_nodes (
          workflow:workflows (
            account_id,
            user_id
          )
        )
      `)
      .eq('id', leadId)
      .single();

    if (error || !leadData) throw new Error(`Lead ${leadId} não encontrado para comentar.`);
    
    const accountInfo = leadData.node?.workflow;
    if (!accountInfo) throw new Error(`Informações da conta não encontradas para o lead ${leadId}`);

    const context = await openContextForAccount(accountInfo.user_id, accountInfo.account_id);
    const page = await context.newPage();
    try {
      await postComment(page, postUrl, commentText);
      await supabase.from('leads').update({ status: 'comment_posted' }).eq('id', leadId);
    } finally {
      await context.close();
    }
    return;
  }

  // Se chegou aqui, é um tipo de job não reconhecido
  throw new Error(`Tipo de job desconhecido: ${job.name}`);
}, { 
  connection,
  concurrency: 5 // Permite até 5 jobs simultâneos
});

worker.on('completed', (job) => {
  console.log(`[worker] Job ${job.id} (tipo: ${job.name}) finalizado com sucesso.`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} (tipo: ${job?.name}) falhou com o erro: ${err.message}`);
});
