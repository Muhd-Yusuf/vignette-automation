import { Page } from 'playwright';
import { BGTOLL_BASE_URL } from '../config/urls';

export async function switchLanguage(page: Page, lang: string): Promise<void> {
  // BGToll language switch: /Localization/ChangeCulture?lang=XX
  // Radio values are: bg, en, de, ru, tr, el, sr, ro
  const langCode = lang === 'en' ? 'en' : lang;

  await page.goto(`${BGTOLL_BASE_URL}/Localization/ChangeCulture?lang=${langCode}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
}

/**
 * Appends a language hint to a payment-gateway URL so it doesn't default to
 * Bulgarian. Different gateways use different param names, so we set the common
 * ones (`lang`, `language`, `lng`) without clobbering any the URL already has.
 */
export function appendLanguageToUrl(rawUrl: string, lang: string): string {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    for (const param of ['lang', 'language', 'lng']) {
      if (!url.searchParams.has(param)) url.searchParams.set(param, lang);
    }
    return url.toString();
  } catch {
    // Not an absolute URL — leave it untouched
    return rawUrl;
  }
}
