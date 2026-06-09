import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

let connection: IORedis;
let purchaseQueue: Queue;
let verificationQueue: Queue;
let checkPeriodQueue: Queue;

export function initQueues() {
  connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  purchaseQueue = new Queue('purchase', { connection });
  verificationQueue = new Queue('verification', { connection });
  checkPeriodQueue = new Queue('check-period', { connection });

  return { purchaseQueue, verificationQueue, checkPeriodQueue };
}

export function getPurchaseQueue(): Queue {
  return purchaseQueue;
}

export function getVerificationQueue(): Queue {
  return verificationQueue;
}

export function getCheckPeriodQueue(): Queue {
  return checkPeriodQueue;
}
