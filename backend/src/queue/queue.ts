
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({
  maxRetriesPerRequest: null,
  lazyConnect: true,
  keepAlive: 30000
});

export const workflowQueue = new Queue('workflowQueue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 10,
    attempts: 1,
    delay: 0,
    backoff: {
      type: 'fixed',
      delay: 2000,
    },
  },
});

export default workflowQueue;
