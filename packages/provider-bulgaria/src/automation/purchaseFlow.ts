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
  // For weekend vignettes, BGToll shows a dropdown of available weekends instead of date picker
  const weekendDropdown = page.locator(SELECTORS.weekendDropdown).first();
  if (await weekendDropdown.isVisible().catch(() => false)) {
    // Select the desired weekend date from dropdown
    const formattedDate = formatDateForInput(params.validityStartDate);
    try {
      // Find the option whose label contains the formatted date
      const options = await weekendDropdown.locator('option').all();
      let matched = false;
      for (const opt of options) {
        const text = await opt.textContent();
        if (text && text.includes(formattedDate)) {
          const val = await opt.getAttribute('value');
          if (val) {
            await weekendDropdown.selectOption({ value: val });
            matched = true;
            break;
          }
        }
      }
      if (!matched && options.length > 1) {
        // Fallback: select first available weekend
        await weekendDropdown.selectOption({ index: 1 });
      }
    } catch {
      // Fallback: select by index (first future weekend)
      const options = await weekendDropdown.locator('option').all();
      if (options.length > 1) {
        await weekendDropdown.selectOption({ index: 1 });
      }
    }
  } else {
    // BGToll's date field is a bootstrap-datepicker in COMPONENT mode: the
    // picker is bound to the wrapper <div id="cbRequestValidityDate" class="date">,
    // and the actual value lives in the readonly input #dpRequestValidityDate
    // (name="RequestValidityDate"). The site reads it via
    // $("#cbRequestValidityDate").datepicker("getDate"), so the ONLY reliable way
    // to set it is datepicker("setDate", <Date>) on the wrapper — the input is
    // readonly, so typing/value injection won't drive the widget's model.
    const targetDate = new Date(params.validityStartDate);

    const apiSet = await page.evaluate((ms: number) => {
      const $ = (window as any).$;
      if (!$ || !$.fn || !$.fn.datepicker) return false;
      const d = new Date(ms);
      const $wrap = $('#cbRequestValidityDate'); // wrapper the picker is bound to
      const $input = $('#dpRequestValidityDate'); // readonly value input
      let ok = false;
      // Component mode: setDate on the wrapper
      try {
        $wrap.datepicker('setDate', d);
        ok = ok || !!$input.val();
      } catch { /* not bound here */ }
      // Fallback: some builds bind directly to the input
      if (!ok) {
        try {
          $input.datepicker('setDate', d);
          ok = ok || !!$input.val();
        } catch { /* ignore */ }
      }
      // Fire the change handler the page listens on (computes the end date)
      $input.trigger('change');
      return !!$input.val();
    }, targetDate.getTime());

    if (!apiSet) {
      // Last resort: open the calendar and click the day cell for the target date.
      const wrapper = page.locator('#cbRequestValidityDate .input-group-addon, #dpRequestValidityDate').first();
      await wrapper.click().catch(() => {});
      await page.waitForTimeout(400);
      const day = targetDate.getDate();
      await page
        .locator(`.datepicker-days td.day:not(.old):not(.new):not(.disabled)`, { hasText: String(day) })
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(400);
    }

    await page.waitForTimeout(800);
  }

  // 4. Set validity start time (if time field exists)
  const timeField = page.locator(SELECTORS.timeDropdown).first();
  if (await timeField.isVisible().catch(() => false)) {
    const tagName = await timeField.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await timeField.selectOption({ value: params.validityStartTime });
    } else {
      // Text input timepicker (used by daily vignettes)
      await timeField.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type(params.validityStartTime || '00:00', { delay: 30 });
      await page.keyboard.press('Tab');
    }
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
  // Click the confirm/submit button using JS click to bypass any overlays (reCAPTCHA popup)
  const submitBtn = page.locator(SELECTORS.confirmButton).first();
  await submitBtn.waitFor({ state: 'attached' });

  // Use evaluate to click directly, bypassing overlay checks
  await page.evaluate(() => {
    const btn = document.getElementById('btnConfirm') ||
      document.querySelector('button[type="submit"]') ||
      document.querySelector('.btn-primary');
    if (btn) (btn as HTMLElement).click();
  });

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
