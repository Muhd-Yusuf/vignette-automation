import { Job } from 'bullmq';
import { Purchase, PurchaseLog } from '@vignette/database';
import { BulgariaProvider, BulgariaConfig } from '@vignette/provider-bulgaria';
import { BrowserPoolManager } from '../browser/poolManager';

interface PurchaseJobData {
  purchaseId: string;
  country: string;
  vehicleType: 'light' | 'trailer';
  vignetteType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'weekend';
  vehicleCountry: string;
  plateNumber: string;
  validityStartDate: string;
  validityStartTime: string;
  email: string;
  language?: 'bg' | 'en' | 'de' | 'ru' | 'tr' | 'el' | 'sr' | 'ro';
}

export function createPurchaseProcessor(pool: BrowserPoolManager, providerConfig: BulgariaConfig) {
  return async function processPurchase(job: Job<PurchaseJobData>) {
    const { purchaseId, ...params } = job.data;

    // Update status to processing
    await Purchase.findByIdAndUpdate(purchaseId, {
      status: 'processing',
      $inc: { attempts: 1 },
    });

    await logStep(purchaseId, 'info', 'start', 'Purchase processing started');

    // Acquire browser from pool
    const browser = await pool.acquire();

    try {
      await logStep(purchaseId, 'info', 'browser_acquired', 'Browser instance acquired');

      // Create provider and execute purchase
      const provider = new BulgariaProvider(browser, providerConfig);
      const result = await provider.purchase(params);

      if (result.success && result.paymentUrl) {
        // Success - update with payment URL
        await Purchase.findByIdAndUpdate(purchaseId, {
          status: 'awaiting_payment',
          paymentUrl: result.paymentUrl,
          paymentUrlExpiry: result.paymentUrlExpiry,
          priceEUR: result.priceEUR,
          priceBGN: result.priceBGN,
          validityEndDate: result.validityEnd,
        });

        await logStep(purchaseId, 'info', 'payment_url_extracted', `Payment URL: ${result.paymentUrl}`);

        return { success: true, paymentUrl: result.paymentUrl };
      } else {
        // Failed
        await Purchase.findByIdAndUpdate(purchaseId, {
          status: 'failed',
          lastError: result.error || 'Unknown error',
        });

        await logStep(purchaseId, 'error', 'purchase_failed', result.error || 'Unknown error');

        throw new Error(result.error || 'Purchase failed');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await Purchase.findByIdAndUpdate(purchaseId, {
        status: 'failed',
        lastError: errorMsg,
      });

      await logStep(purchaseId, 'error', 'exception', errorMsg);

      throw error; // Re-throw for BullMQ retry
    } finally {
      await pool.release(browser);
      await logStep(purchaseId, 'info', 'browser_released', 'Browser instance released');
    }
  };
}

async function logStep(
  purchaseId: string,
  level: string,
  step: string,
  message: string,
  data?: Record<string, unknown>
) {
  await PurchaseLog.create({ purchaseId, level, step, message, data });
}
