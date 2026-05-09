import { Page } from 'playwright';
import { PurchaseParams } from '@vignette/core';
import { SELECTORS } from '../config/selectors';
import { PAYMENT_GATEWAY_PATTERNS } from '../config/urls';
import { getCountryLabel } from '../config/countries';
import { CaptchaSolver } from '../captcha/captchaSolver';

export interface PurchaseFlowResult {
  paymentUrl: string;
  validityEnd?: string;
}

export async function fillPurchaseForm(page: Page, params: PurchaseParams): Promise<void> {
  // 1. Select vehicle registration country
  const countrySelect = page.locator(SELECTORS.countryDropdown).first();
  await countrySelect.waitFor({ state: 'visible', timeout: 10000 });

  // Try selecting by value (ISO code) first, then by label
  try {
    await countrySelect.selectOption({ value: params.vehicleCountry.toUpperCase() });
  } catch {
    const label = getCountryLabel(params.vehicleCountry);
    await countrySelect.selectOption({ label });
  }

  await page.waitForTimeout(500); // Allow any AJAX after country change

  // 2. Fill license plate number
  const plateInput = page.locator(SELECTORS.plateInput).first();
  await plateInput.waitFor({ state: 'visible' });
  await plateInput.fill(params.plateNumber.toUpperCase());

  // 3. Set validity start date
  const dateInput = page.locator(SELECTORS.dateInput).first();
  if (await dateInput.isVisible()) {
    await dateInput.fill(formatDateForInput(params.validityStartDate));
  }

  // 4. Set validity start time (if dropdown exists)
  const timeSelect = page.locator(SELECTORS.timeDropdown).first();
  if (await timeSelect.isVisible().catch(() => false)) {
    await timeSelect.selectOption({ value: params.validityStartTime });
  }

  // 5. Wait for end date calculation (AJAX)
  await page.waitForTimeout(1000);

  // 6. Fill email
  const emailInput = page.locator(SELECTORS.emailInput).first();
  await emailInput.waitFor({ state: 'visible' });
  await emailInput.fill(params.email);

  // 7. Check all checkboxes (terms, declarations)
  const checkboxes = page.locator(SELECTORS.allCheckboxes);
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    const checkbox = checkboxes.nth(i);
    if (!(await checkbox.isChecked())) {
      await checkbox.check();
    }
  }
}

// CAPTCHA solving is now handled by CaptchaSolver.solveOnPage() in BulgariaProvider
// using stealth browser bypass — no paid service needed

export async function submitAndConfirm(page: Page): Promise<void> {
  // Click the confirm/submit button
  const submitBtn = page.locator(SELECTORS.confirmButton).first();
  await submitBtn.waitFor({ state: 'visible' });
  await submitBtn.click();

  // Wait for either a SweetAlert dialog or page navigation
  await Promise.race([
    page.waitForSelector(SELECTORS.sweetAlertPopup, { timeout: 10000 }).then(async () => {
      // Click confirm in the dialog
      const confirmBtn = page.locator(SELECTORS.sweetAlertConfirm).first();
      await confirmBtn.waitFor({ state: 'visible' });
      await confirmBtn.click();
    }),
    page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
  ]);

  // Wait for any subsequent navigation after dialog confirm
  await page.waitForTimeout(2000);
}

export async function extractPaymentUrl(page: Page): Promise<string> {
  // Strategy 1: Check if current URL is already a payment gateway
  const currentUrl = page.url();
  if (isPaymentGatewayUrl(currentUrl)) {
    return currentUrl;
  }

  // Strategy 2: Look for payment link on the page
  const paymentLinks = page.locator('a[href*="pay"], a[href*="gateway"], a[href*="epay"], a[href*="borica"]');
  const linkCount = await paymentLinks.count();
  if (linkCount > 0) {
    const href = await paymentLinks.first().getAttribute('href');
    if (href) {
      return href.startsWith('http') ? href : `https://web.bgtoll.bg${href}`;
    }
  }

  // Strategy 3: Check for form action pointing to payment gateway
  const forms = page.locator('form[action*="pay"], form[action*="gateway"], form[action*="epay"]');
  const formCount = await forms.count();
  if (formCount > 0) {
    const action = await forms.first().getAttribute('action');
    if (action) {
      return action.startsWith('http') ? action : `https://web.bgtoll.bg${action}`;
    }
  }

  // Strategy 4: Look for any iframe with payment src
  const iframes = page.locator('iframe[src*="pay"], iframe[src*="gateway"]');
  const iframeCount = await iframes.count();
  if (iframeCount > 0) {
    const src = await iframes.first().getAttribute('src');
    if (src) return src;
  }

  throw new Error('Could not extract payment URL from page');
}

/**
 * Sets up network interception to capture payment gateway redirects.
 * Call this BEFORE submitting the form.
 * Returns a promise that resolves with the payment URL when intercepted.
 */
export function setupPaymentUrlInterception(page: Page): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Payment URL interception timeout (30s)'));
    }, 30000);

    const cleanup = () => {
      clearTimeout(timeout);
      page.removeListener('request', onRequest);
      page.removeListener('response', onResponse);
    };

    const onRequest = (request: any) => {
      const url = request.url();
      if (isPaymentGatewayUrl(url)) {
        cleanup();
        resolve(url);
      }
    };

    const onResponse = (response: any) => {
      const status = response.status();
      if (status === 301 || status === 302) {
        const location = response.headers()['location'];
        if (location && isPaymentGatewayUrl(location)) {
          cleanup();
          resolve(location);
        }
      }
    };

    page.on('request', onRequest);
    page.on('response', onResponse);
  });
}

function isPaymentGatewayUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return PAYMENT_GATEWAY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function formatDateForInput(dateStr: string): string {
  // Input format: 2026-05-10 (ISO)
  // BGToll may expect DD.MM.YYYY or DD/MM/YYYY
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}
