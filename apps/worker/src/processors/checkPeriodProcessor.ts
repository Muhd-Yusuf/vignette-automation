import { Job } from 'bullmq';
import { PeriodCheck } from '@vignette/database';
import { BulgariaProvider, BulgariaConfig } from '@vignette/provider-bulgaria';
import { BrowserPoolManager } from '../browser/poolManager';

interface CheckPeriodJobData {
  checkId: string;
  country: string;
  vehicleType: 'light' | 'trailer';
  vignetteType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'weekend';
  vehicleCountry: string;
  plateNumber: string;
  validityStartDate: string;
  validityStartTime?: string;
}

export function createCheckPeriodProcessor(pool: BrowserPoolManager, providerConfig: BulgariaConfig) {
  return async function processCheckPeriod(job: Job<CheckPeriodJobData>) {
    const { checkId, ...params } = job.data;

    const browser = await pool.acquire();

    try {
      const provider = new BulgariaProvider(browser, providerConfig);
      const result = await provider.checkPeriod(params);

      await PeriodCheck.findByIdAndUpdate(checkId, {
        status: 'completed',
        purchasable: result.purchasable,
        isOverlapping: result.isOverlapping,
        hasExactMatching: result.hasExactMatching,
        isCloseToEndDay: result.isCloseToEndDay,
        message: result.message,
        overlappingVignettes: result.overlappingVignettes,
        error: result.error,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await PeriodCheck.findByIdAndUpdate(checkId, { status: 'failed', error: errorMsg });
      throw error;
    } finally {
      await pool.release(browser);
    }
  };
}
