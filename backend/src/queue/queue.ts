import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Configure sua conexão com o Redis (use variáveis de ambiente em produção)
const connection = new IORedis({
  maxRetriesPerRequest: null,
  lazyConnect: true
});

// Exporta a fila de workflows com configurações otimizadas
export const workflowQueue = new Queue('workflow-jobs', { 
  connection,
  defaultJobOptions: {
    removeOnComplete: 5, // Mantém apenas os últimos 5 jobs completados
    removeOnFail: 10,    // Mantém apenas os últimos 10 jobs falhados
    attempts: 2,         // Tenta 2 vezes antes de falhar
    backoff: {
      type: 'exponential',
      delay: 2000,
    }
  }
});