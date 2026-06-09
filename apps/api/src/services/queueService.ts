import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

let connection: IORedis;
let purchaseQueue: Queue;
let verificationQueue: Queue;
let checkPeriodQueue: Queue;
let checkPeriodEvents: QueueEvents;

export function initQueues() {
  connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  purchaseQueue = new Queue('purchase', { connection });
  verificationQueue = new Queue('verification', { connection });
  checkPeriodQueue = new Queue('check-period', { connection });

  // Dedicated connection for blocking event streams (job.waitUntilFinished).
  // Lets the check-period endpoint respond synchronously.
  checkPeriodEvents = new QueueEvents('check-period', {
    connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }),
  });

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

export function getCheckPeriodEvents(): QueueEvents {
  return checkPeriodEvents;
}
