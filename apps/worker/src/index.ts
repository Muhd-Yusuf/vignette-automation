import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { connectDB } from '@vignette/database';
import { BulgariaConfig } from '@vignette/provider-bulgaria';
import { BrowserPoolManager } from './browser/poolManager';
import { createPurchaseProcessor } from './processors/purchaseProcessor';
import { createVerificationProcessor } from './processors/verificationProcessor';
import { createCheckPeriodProcessor } from './processors/checkPeriodProcessor';

async function main() {
  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vignette_automation';
  await connectDB(mongoUri);

  // Redis connection
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  // Browser pool
  const pool = new BrowserPoolManager({
    maxInstances: parseInt(process.env.BROWSER_POOL_SIZE || '3', 10),
    headless: process.env.BROWSER_HEADLESS !== 'false',
  });
  await pool.initialize();

  // Provider config
  const providerConfig: BulgariaConfig = {
    language: 'en',
    navigationTimeout: parseInt(process.env.BROWSER_TIMEOUT || '60000', 10),
    captchaApiKey: process.env.CAPTCHA_API_KEY,
    captchaService: (process.env.CAPTCHA_SERVICE as any) || 'capsolver',
  };

  // Purchase worker
  const purchaseWorker = new Worker(
    'purchase',
    createPurchaseProcessor(pool, providerConfig),
    {
      connection,
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '3', 10),
      limiter: { max: 5, duration: 60000 },
    }
  );

  purchaseWorker.on('completed', (job) => {
    console.log(`Purchase job ${job.id} completed`);
  });

  purchaseWorker.on('failed', (job, err) => {
    console.error(`Purchase job ${job?.id} failed:`, err.message);
  });

  // Verification worker
  const verificationWorker = new Worker(
    'verification',
    createVerificationProcessor(pool, providerConfig),
    {
      connection,
      concurrency: 2,
    }
  );

  verificationWorker.on('completed', (job) => {
    console.log(`Verification job ${job.id} completed`);
  });

  verificationWorker.on('failed', (job, err) => {
    console.error(`Verification job ${job?.id} failed:`, err.message);
  });

  // Check-period worker (pre-purchase validation; no CAPTCHA, so it's quick)
  const checkPeriodWorker = new Worker(
    'check-period',
    createCheckPeriodProcessor(pool, providerConfig),
    {
      connection,
      concurrency: 2,
    }
  );

  checkPeriodWorker.on('completed', (job) => {
    console.log(`Check-period job ${job.id} completed`);
  });

  checkPeriodWorker.on('failed', (job, err) => {
    console.error(`Check-period job ${job?.id} failed:`, err.message);
  });

  console.log('Worker started. Listening for jobs...');
  console.log('Browser pool stats:', pool.getStats());

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await purchaseWorker.close();
    await verificationWorker.close();
    await checkPeriodWorker.close();
    await pool.shutdown();
    await connection.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
