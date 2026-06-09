import { Page, Frame } from 'playwright';

export type CaptchaService = 'capsolver' | 'capmonster' | '2captcha';

export interface CaptchaConfig {
  apiKey?: string;
  service?: CaptchaService;
}

const SERVICE_URLS: Record<CaptchaService, { submit: string; poll: string }> = {
  capsolver: {
    submit: 'https://api.capsolver.com/createTask',
    poll: 'https://api.capsolver.com/getTaskResult',
  },
  capmonster: {
    submit: 'https://api.capmonster.cloud/createTask',
    poll: 'https://api.capmonster.cloud/getTaskResult',
  },
  '2captcha': {
    submit: 'https://2captcha.com/in.php',
    poll: 'https://2captcha.com/res.php',
  },
};

/**
 * CAPTCHA solver supporting CapSolver, CapMonster, and 2captcha.
 *
 * If an API key + service is provided, uses that service.
 * Otherwise falls back to stealth checkbox click (unreliable).
 */
export class CaptchaSolver {
  private apiKey?: string;
  private service: CaptchaService;

  constructor(config?: CaptchaConfig | string) {
    if (typeof config === 'string') {
      // Backwards compat: plain API key string defaults to 2captcha
      this.apiKey = config || undefined;
      this.service = '2captcha';
    } else {
      this.apiKey = config?.apiKey;
      this.service = config?.service || '2captcha';
    }
  }

  async solveOnPage(page: Page): Promise<boolean> {
    const hasRecaptcha = await page.locator('.g-recaptcha, [data-sitekey], #hdnCaptchaResponse').count();
    if (hasRecaptcha === 0) {
      return true;
    }

    await this.humanDelay(1000, 1800);

    if (this.apiKey) {
      // Solving services miss occasionally (~1 in 10). Retry once before giving
      // up — far cheaper than failing the whole job and re-running the browser
      // flow via the queue's outer retry.
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`[CAPTCHA] Using ${this.service} (attempt ${attempt}/${maxAttempts})...`);
        const solved = this.service === '2captcha'
          ? await this.solveWith2Captcha(page)
          : await this.solveWithTaskAPI(page);
        if (solved) return true;
        if (attempt < maxAttempts) {
          console.log('[CAPTCHA] Attempt failed — retrying once...');
          await this.humanDelay(1000, 2000);
        }
      }
      return false;
    }

    console.log('[CAPTCHA] No API key — trying stealth checkbox click...');
    return await this.tryStealth(page);
  }

  // ------------------------------------------------------------------
  // CapSolver / CapMonster (both use the same createTask/getTaskResult API)
  // ------------------------------------------------------------------

  private async solveWithTaskAPI(page: Page): Promise<boolean> {
    try {
      const sitekey = await this.getSitekey(page);
      if (!sitekey) return false;

      const pageUrl = page.url();
      const urls = SERVICE_URLS[this.service];

      console.log(`[CAPTCHA] Sitekey: ${sitekey}`);
      console.log(`[CAPTCHA] Page URL: ${pageUrl}`);

      // 1. Create task
      const taskType = this.service === 'capsolver'
        ? 'ReCaptchaV2TaskProxyLess'
        : 'RecaptchaV2TaskProxyless'; // CapMonster uses slightly different casing

      const createBody = {
        clientKey: this.apiKey,
        task: {
          type: taskType,
          websiteURL: pageUrl,
          websiteKey: sitekey,
        },
      };

      console.log(`[CAPTCHA] Creating task on ${this.service}...`);

      const createResponse = await this.httpPost(urls.submit, createBody);

      if (createResponse.errorId && createResponse.errorId !== 0) {
        console.error(`[CAPTCHA] ${this.service} create error:`, createResponse.errorDescription || createResponse.errorCode);
        return false;
      }

      const taskId = createResponse.taskId;
      if (!taskId) {
        console.error(`[CAPTCHA] ${this.service} no taskId returned:`, createResponse);
        return false;
      }

      console.log(`[CAPTCHA] Task ID: ${taskId}`);

      // 2. Poll for result (max ~120 seconds, 3s interval for lower latency)
      let token: string | null = null;
      for (let i = 0; i < 40; i++) {
        await this.humanDelay(3000, 3000);

        const pollBody = { clientKey: this.apiKey, taskId };
        const pollResponse = await this.httpPost(urls.poll, pollBody);

        if (pollResponse.status === 'ready') {
          token = pollResponse.solution?.gRecaptchaResponse;
          break;
        }

        if (pollResponse.status === 'processing') {
          console.log('[CAPTCHA] Waiting for solution...');
          continue;
        }

        // Error
        if (pollResponse.errorId && pollResponse.errorId !== 0) {
          console.error(`[CAPTCHA] ${this.service} poll error:`, pollResponse.errorDescription || pollResponse.errorCode);
          return false;
        }

        console.log('[CAPTCHA] Waiting for solution...');
      }

      if (!token) {
        console.error(`[CAPTCHA] ${this.service} timeout — no solution after 120s`);
        return false;
      }

      console.log('[CAPTCHA] Token received, injecting...');
      return await this.injectToken(page, token);
    } catch (error) {
      console.error(`[CAPTCHA] ${this.service} error:`, error);
      return false;
    }
  }

  // ------------------------------------------------------------------
  // 2captcha (legacy API format)
  // ------------------------------------------------------------------

  private async solveWith2Captcha(page: Page): Promise<boolean> {
    try {
      const sitekey = await this.getSitekey(page);
      if (!sitekey) return false;

      const pageUrl = page.url();
      console.log('[CAPTCHA] Sitekey:', sitekey);
      console.log('[CAPTCHA] Page URL:', pageUrl);

      // 1. Submit to 2captcha
      const submitUrl = `https://2captcha.com/in.php?key=${this.apiKey}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;

      const submitResponse = await this.httpGet(submitUrl);

      if (submitResponse.status !== 1) {
        console.error('[CAPTCHA] 2captcha submit failed:', submitResponse);
        return false;
      }

      const taskId = submitResponse.request;
      console.log('[CAPTCHA] 2captcha task ID:', taskId);

      // 2. Poll for result (max ~120 seconds, 3s interval for lower latency)
      let token: string | null = null;
      for (let i = 0; i < 40; i++) {
        await this.humanDelay(3000, 3000);

        const resultUrl = `https://2captcha.com/res.php?key=${this.apiKey}&action=get&id=${taskId}&json=1`;
        const resultResponse = await this.httpGet(resultUrl);

        if (resultResponse.status === 1) {
          token = resultResponse.request;
          break;
        }

        if (resultResponse.request !== 'CAPCHA_NOT_READY') {
          console.error('[CAPTCHA] 2captcha error:', resultResponse);
          return false;
        }

        console.log('[CAPTCHA] Waiting for solution...');
      }

      if (!token) {
        console.error('[CAPTCHA] 2captcha timeout — no solution after 120s');
        return false;
      }

      console.log('[CAPTCHA] Token received, injecting...');
      return await this.injectToken(page, token);
    } catch (error) {
      console.error('[CAPTCHA] 2captcha error:', error);
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Token injection (shared by all services)
  // ------------------------------------------------------------------

  private async injectToken(page: Page, token: string): Promise<boolean> {
    const injected = await page.evaluate((captchaToken: string) => {
      let success = false;

      // 1. Set the hidden field BGToll uses (purchase page)
      const hdnField = document.getElementById('hdnCaptchaResponse') as HTMLInputElement;
      if (hdnField) {
        hdnField.value = captchaToken;
        success = true;
      }

      // 2. Set ALL g-recaptcha-response textareas (Google creates these)
      const textareas = document.querySelectorAll<HTMLTextAreaElement>(
        'textarea[name="g-recaptcha-response"], #g-recaptcha-response'
      );
      textareas.forEach((ta) => {
        ta.value = captchaToken;
        ta.style.display = 'block'; // ensure it's not hidden/ignored
        success = true;
      });

      // 3. Also set any hidden inputs with captcha-related names
      const hiddenInputs = document.querySelectorAll<HTMLInputElement>(
        'input[name*="captcha" i], input[name*="recaptcha" i], input[id*="captcha" i]'
      );
      hiddenInputs.forEach((input) => {
        input.value = captchaToken;
        success = true;
      });

      // 4. Call BGToll's custom callback (purchase page uses recaptchaCallback)
      if (typeof (window as any).recaptchaCallback === 'function') {
        (window as any).recaptchaCallback(captchaToken);
        success = true;
      }

      // 5. Try the standard grecaptcha callback
      if ((window as any).grecaptcha) {
        try {
          // Find the callback from data-callback attribute
          const widget = document.querySelector('[data-callback]');
          const callbackName = widget?.getAttribute('data-callback');
          if (callbackName && typeof (window as any)[callbackName] === 'function') {
            (window as any)[callbackName](captchaToken);
            success = true;
          }
        } catch { /* ignore */ }
      }

      return success;
    }, token);

    console.log('[CAPTCHA] Token injected:', injected);
    return injected;
  }

  // ------------------------------------------------------------------
  // Stealth fallback (no API key)
  // ------------------------------------------------------------------

  private async tryStealth(page: Page): Promise<boolean> {
    const recaptchaFrame = await this.findRecaptchaFrame(page);
    if (!recaptchaFrame) {
      return await this.tryTokenInjection(page);
    }

    await this.humanDelay(500, 1500);

    try {
      const checkbox = recaptchaFrame.locator('#recaptcha-anchor');
      await checkbox.waitFor({ state: 'visible', timeout: 5000 });

      await this.humanDelay(200, 600);
      await checkbox.click();
      await this.humanDelay(2000, 4000);

      const checked = await checkbox.getAttribute('aria-checked');
      if (checked === 'true') {
        console.log('[CAPTCHA] Checkbox click passed!');
        return true;
      }

      await this.humanDelay(5000, 8000);
      const rechecked = await checkbox.getAttribute('aria-checked');
      if (rechecked === 'true') {
        console.log('[CAPTCHA] Checkbox auto-resolved!');
        return true;
      }

      return await this.tryTokenInjection(page);
    } catch {
      return await this.tryTokenInjection(page);
    }
  }

  private async findRecaptchaFrame(page: Page): Promise<Frame | null> {
    const frames = page.frames();
    for (const frame of frames) {
      const url = frame.url();
      if (url.includes('recaptcha') && url.includes('anchor')) {
        return frame;
      }
    }

    const hasRecaptcha = await page.locator('.g-recaptcha, [data-sitekey]').count();
    if (hasRecaptcha > 0) {
      await page.waitForTimeout(3000);
      const framesAfterWait = page.frames();
      for (const frame of framesAfterWait) {
        if (frame.url().includes('recaptcha') && frame.url().includes('anchor')) {
          return frame;
        }
      }
    }

    return null;
  }

  private async tryTokenInjection(page: Page): Promise<boolean> {
    try {
      const result = await page.evaluate(() => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let token = '03AFY_a8';
        for (let i = 0; i < 500; i++) {
          token += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        if (typeof (window as any).recaptchaCallback === 'function') {
          (window as any).recaptchaCallback(token);
          return true;
        }

        const hdnField = document.getElementById('hdnCaptchaResponse') as HTMLInputElement;
        const textarea = document.querySelector<HTMLTextAreaElement>(
          'textarea[name="g-recaptcha-response"]'
        );
        if (hdnField) hdnField.value = token;
        if (textarea) textarea.value = token;

        return !!(hdnField?.value || textarea?.value);
      });

      return result;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async getSitekey(page: Page): Promise<string | null> {
    const sitekey = await page.evaluate(() => {
      const el = document.querySelector('[data-sitekey]');
      return el?.getAttribute('data-sitekey') || null;
    });

    if (!sitekey) {
      console.error('[CAPTCHA] Could not find reCAPTCHA sitekey on page');
    }
    return sitekey;
  }

  private async httpPost(url: string, body: any): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  private async httpGet(url: string): Promise<any> {
    const res = await fetch(url);
    return res.json();
  }

  private humanDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
