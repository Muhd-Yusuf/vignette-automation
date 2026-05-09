import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

let connection: IORedis;
let purchaseQueue: Queue;
let verificationQueue: Queue;

export function initQueues() {
  connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  purchaseQueue = new Queue('purchase', { connection });
  verificationQueue = new Queue('verification', { connection });

  return { purchaseQueue, verificationQueue };
}

export function getPurchaseQueue(): Queue {
  return purchaseQueue;
}

export function getVerificationQueue(): Queue {
  return verificationQueue;
}
