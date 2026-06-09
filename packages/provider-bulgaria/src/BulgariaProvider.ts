import { Browser } from 'playwright';
import {
  IVignetteProvider,
  PurchaseParams,
  PurchaseResult,
  VerificationParams,
  VerificationResult,
  CheckPeriodParams,
  CheckPeriodResult,
} from '@vignette/core';
import { CaptchaSolver, CaptchaService } from './captcha/captchaSolver';
import {
  BGTOLL_BASE_URL,
  BGTOLL_URLS,
  VEHICLE_TYPE_IDS,
  VIGNETTE_TYPE_IDS,
  VIGNETTE_PRICES,
} from './config/urls';
import {
  fillPurchaseForm,
  submitAndConfirm,
  extractPaymentUrl,
  setupPaymentUrlInterception,
} from './automation/purchaseFlow';
import { verifyVignette } from './automation/verificationFlow';
import { checkPeriodOnPage } from './automation/checkPeriodFlow';
import { switchLanguage } from './utils/languageSwitcher';
import { appendLanguageToUrl } from './utils/languageSwitcher';

export interface BulgariaConfig {
  language?: string;
  navigationTimeout?: number;
  captchaApiKey?: string;
  captchaService?: CaptchaService; // 'capsolver' | 'capmonster' | '2captcha' (default: '2captcha')
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
    this.captchaSolver = new CaptchaSolver({
      apiKey: config.captchaApiKey,
      service: config.captchaService,
    });
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
    const timeout = this.config.navigationTimeout || 60000;
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    // Language drives both the BGToll UI and (via the inherited culture cookie)
    // the payment gateway. Defaults to English.
    const language = params.language || (this.config.language as PurchaseParams['language']) || 'en';

    try {
      // Step 1: Switch to the requested language (sets a culture cookie + redirects)
      console.log(`[BGToll] Switching language to '${language}'...`);
      await page.goto(`${this.baseUrl}/Localization/ChangeCulture?lang=${language}`, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
      // Wait for redirect to complete and cookies to be set
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      // Step 2: Navigate directly to the purchase form page
      // Skip the validity period page — go straight to /Evignette/Create?vignetteTypeID=X
      const vignetteTypeId = VIGNETTE_TYPE_IDS[params.vignetteType];
      const vehicleTypeId = VEHICLE_TYPE_IDS[params.vehicleType];
      const createUrl = `${this.baseUrl}/Evignette/Create?vignetteTypeID=${vignetteTypeId}&vignetteVehicleTypeID=${vehicleTypeId}`;
      console.log('[BGToll] Navigating to purchase form:', createUrl);

      await page.goto(createUrl, {
        waitUntil: 'commit',
        timeout,
      });
      await page.waitForLoadState('domcontentloaded').catch(() => {});

      // Step 4: Fill the purchase form
      await fillPurchaseForm(page, params);

      // Step 4b: Pre-validate the period via CheckPeriod BEFORE spending a CAPTCHA
      // solve. BGToll rejects a purchase when the plate already has an exactly
      // matching vignette for the period — fail fast with its own message instead
      // of submitting and failing after the (slow, paid) CAPTCHA step.
      console.log('[BGToll] Running CheckPeriod pre-validation...');
      const period = await checkPeriodOnPage(page, {
        vehicleCountry: params.vehicleCountry,
        plateNumber: params.plateNumber,
        validityStartDate: params.validityStartDate,
        validityStartTime: params.validityStartTime,
      });
      if (period.error) {
        console.log('[BGToll] CheckPeriod inconclusive, continuing:', period.error);
      } else if (!period.purchasable) {
        return {
          success: false,
          error:
            period.message ||
            'Purchase blocked: the plate already has a matching vignette for this period.',
        };
      }

      // Step 5: Bypass CAPTCHA using stealth techniques (no paid service)
      const captchaSolved = await this.captchaSolver.solveOnPage(page);
      if (!captchaSolved) {
        throw new Error('CAPTCHA bypass failed — may need manual intervention');
      }

      // Step 6: Set up payment URL interception BEFORE submit
      // Attach .catch to prevent unhandled rejection if interception times out
      const paymentUrlPromise = setupPaymentUrlInterception(page).catch((e) => {
        console.log('[BGToll] Payment interception:', e.message);
        return null as unknown as string;
      });

      // Step 7: Submit form and handle confirmation
      console.log('[BGToll] Submitting form...');
      await submitAndConfirm(page);

      console.log('[BGToll] After submit, current URL:', page.url());

      // Step 8: Wait for page to settle after submit
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(3000);

      // Check if form submission was rejected (still on Create page = something failed)
      if (page.url().includes('/Evignette/Create')) {
        // Check for specific error messages on the page
        const errorText = await page.evaluate(() => {
          // Look for validation error messages
          const validationErrors = document.querySelector('.validation-summary-errors, .alert-danger, .field-validation-error');
          if (validationErrors?.textContent?.trim()) return validationErrors.textContent.trim();
          // Look for the specific CAPTCHA error in Bulgarian
          const captchaError = document.getElementById('txtCaptchaError');
          if (captchaError?.textContent?.trim()) return `CAPTCHA error: ${captchaError.textContent.trim()}`;
          // Check for required field highlights
          const requiredFields = document.querySelectorAll('.input-validation-error, .is-invalid');
          if (requiredFields.length > 0) return `Form validation failed: ${requiredFields.length} required field(s) not filled`;
          return 'Form submission was rejected (page did not redirect)';
        });
        throw new Error(errorText);
      }

      console.log('[BGToll] After settle, current URL:', page.url());

      // Step 9: Extract payment URL (race between interception and page scan)
      let paymentUrl: string;
      const interceptedUrl = await paymentUrlPromise;
      if (interceptedUrl) {
        paymentUrl = interceptedUrl;
      } else {
        try {
          paymentUrl = await extractPaymentUrl(page);
        } catch {
          console.log('[BGToll] First extraction failed, waiting...');
          await page.waitForTimeout(5000);
          paymentUrl = await extractPaymentUrl(page);
        }
      }

      const prices = VIGNETTE_PRICES[params.vignetteType];

      // Carry the chosen language onto the payment gateway URL so the paygate
      // doesn't fall back to Bulgarian.
      const localizedPaymentUrl = appendLanguageToUrl(paymentUrl, language);

      return {
        success: true,
        paymentUrl: localizedPaymentUrl,
        paymentUrlExpiry: new Date(Date.now() + 15 * 60 * 1000),
        priceEUR: prices.eur,
        priceBGN: prices.bgn,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[BGToll] Purchase error:', errMsg);
      console.error('[BGToll] Final page URL:', page.url());

      // Save screenshot for debugging
      const screenshotPath = `/tmp/bgtoll-error-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      console.error('[BGToll] Screenshot saved:', screenshotPath);

      const screenshot = await page.screenshot().catch(() => undefined);
      return {
        success: false,
        error: errMsg,
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

  async checkPeriod(params: CheckPeriodParams): Promise<CheckPeriodResult> {
    const context = await this.browser.newContext({
      locale: 'en-GB',
      timezoneId: 'Europe/Sofia',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    const timeout = this.config.navigationTimeout || 30000;
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    try {
      const language = (this.config.language as string) || 'en';
      await page.goto(`${this.baseUrl}/Localization/ChangeCulture?lang=${language}`, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      // Load the Create page so we get the anti-forgery token, the resolved
      // vignette type ids, and the session cookies CheckPeriod requires.
      const vignetteTypeId = VIGNETTE_TYPE_IDS[params.vignetteType];
      const vehicleTypeId = VEHICLE_TYPE_IDS[params.vehicleType];
      await page.goto(
        `${this.baseUrl}/Evignette/Create?vignetteTypeID=${vignetteTypeId}&vignetteVehicleTypeID=${vehicleTypeId}`,
        { waitUntil: 'commit', timeout }
      );
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      return await checkPeriodOnPage(page, {
        vehicleCountry: params.vehicleCountry,
        plateNumber: params.plateNumber,
        validityStartDate: params.validityStartDate,
        validityStartTime: params.validityStartTime,
      });
    } catch (error) {
      return {
        purchasable: false,
        isOverlapping: false,
        hasExactMatching: false,
        isCloseToEndDay: false,
        overlappingVignettes: [],
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
