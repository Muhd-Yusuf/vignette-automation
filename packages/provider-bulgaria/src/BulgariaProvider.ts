import { Browser } from 'playwright';
import {
  IVignetteProvider,
  PurchaseParams,
  PurchaseResult,
  VerificationParams,
  VerificationResult,
} from '@vignette/core';
import { CaptchaSolver } from './captcha/captchaSolver';
import {
  BGTOLL_BASE_URL,
  BGTOLL_URLS,
  VEHICLE_TYPE_IDS,
  VIGNETTE_VALIDITY_TYPE_IDS,
  VIGNETTE_PRICES,
} from './config/urls';
import {
  fillPurchaseForm,
  submitAndConfirm,
  extractPaymentUrl,
  setupPaymentUrlInterception,
} from './automation/purchaseFlow';
import { verifyVignette } from './automation/verificationFlow';
import { switchLanguage } from './utils/languageSwitcher';

export interface BulgariaConfig {
  language?: string;
  navigationTimeout?: number;
}

export class BulgariaProvider implements IVignetteProvider {
  readonly name = 'bgtoll';
  readonly country = 'bulgaria';
  readonly baseUrl = BGTOLL_BASE_URL;

  private captchaSolver: CaptchaSolver;
  private config: BulgariaConfig;

  constructor(
    private browser: Browser,
    config: BulgariaConfig
  ) {
    this.config = config;
    this.captchaSolver = new CaptchaSolver();
  }

  async purchase(params: PurchaseParams): Promise<PurchaseResult> {
    const context = await this.browser.newContext({
      locale: 'en-GB',
      timezoneId: 'Europe/Sofia',
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(this.config.navigationTimeout || 30000);

    try {
      // Step 1: Switch to English
      await switchLanguage(page, this.config.language || 'en');

      // Step 2: Navigate to validity period selection
      const vehicleTypeId = VEHICLE_TYPE_IDS[params.vehicleType];
      await page.goto(`${this.baseUrl}${BGTOLL_URLS.validityPeriod(vehicleTypeId)}`);
      await page.waitForLoadState('networkidle');

      // Step 3: Click the correct vignette type link
      const vignetteTypeId = VIGNETTE_VALIDITY_TYPE_IDS[params.vignetteType];
      const vignetteLink = page.locator(
        `a[href*="vignetteValidityTypeID=${vignetteTypeId}"], a[href*="ValidityTypeID=${vignetteTypeId}"]`
      ).first();
      await vignetteLink.click();
      await page.waitForLoadState('networkidle');

      // Step 4: Fill the purchase form
      await fillPurchaseForm(page, params);

      // Step 5: Bypass CAPTCHA using stealth techniques (no paid service)
      const captchaSolved = await this.captchaSolver.solveOnPage(page);
      if (!captchaSolved) {
        throw new Error('CAPTCHA bypass failed — may need manual intervention');
      }

      // Step 6: Set up payment URL interception BEFORE submit
      const paymentUrlPromise = setupPaymentUrlInterception(page);

      // Step 7: Submit form and handle confirmation
      await submitAndConfirm(page);

      // Step 8: Extract payment URL (race between interception and page scan)
      let paymentUrl: string;
      try {
        paymentUrl = await Promise.race([
          paymentUrlPromise,
          extractPaymentUrl(page),
        ]);
      } catch {
        // Last resort: wait a bit and check current page
        await page.waitForTimeout(3000);
        paymentUrl = await extractPaymentUrl(page);
      }

      const prices = VIGNETTE_PRICES[params.vignetteType];

      return {
        success: true,
        paymentUrl,
        paymentUrlExpiry: new Date(Date.now() + 15 * 60 * 1000),
        priceEUR: prices.eur,
        priceBGN: prices.bgn,
      };
    } catch (error) {
      const screenshot = await page.screenshot().catch(() => undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        screenshots: screenshot ? [screenshot] : undefined,
      };
    } finally {
      await context.close();
    }
  }

  async verify(params: VerificationParams): Promise<VerificationResult> {
    const context = await this.browser.newContext({
      locale: 'en-GB',
      timezoneId: 'Europe/Sofia',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(this.config.navigationTimeout || 30000);

    try {
      await switchLanguage(page, this.config.language || 'en');
      return await verifyVignette(page, params, this.captchaSolver);
    } catch (error) {
      return {
        found: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await context.close();
    }
  }

  async healthCheck(): Promise<boolean> {
    const context = await this.browser.newContext();
    const page = await context.newPage();

    try {
      const response = await page.goto(this.baseUrl, { timeout: 10000 });
      return response?.status() === 200;
    } catch {
      return false;
    } finally {
      await context.close();
    }
  }
}
