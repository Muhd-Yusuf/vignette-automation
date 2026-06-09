import { Job } from 'bullmq';
import { Verification } from '@vignette/database';
import { BulgariaProvider, BulgariaConfig } from '@vignette/provider-bulgaria';
import { BrowserPoolManager } from '../browser/poolManager';

interface VerificationJobData {
  verificationId: string;
  country: string;
  vehicleCountry: string;
  plateNumber: string;
  status?: 'active' | 'expired' | 'unused';
}

export function createVerificationProcessor(pool: BrowserPoolManager, providerConfig: BulgariaConfig) {
  return async function processVerification(job: Job<VerificationJobData>) {
    const { verificationId, ...params } = job.data;

    const browser = await pool.acquire();

    try {
      const provider = new BulgariaProvider(browser, providerConfig);
      const result = await provider.verify(params);

      await Verification.findByIdAndUpdate(verificationId, {
        status: 'completed',
        isActive: result.isActive,
        vignettes: result.vignettes,
        validFrom: result.validFrom,
        validTo: result.validTo,
        productType: result.productType,
        error: result.error,
        finalizedAt: new Date(),
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await Verification.findByIdAndUpdate(verificationId, {
        status: 'failed',
        error: errorMsg,
        finalizedAt: new Date(),
      });

      throw error;
    } finally {
      await pool.release(browser);
    }
  };
}
