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
 * Forces the language on a payment-gateway URL. BGToll always emits the TECS
 * gateway URL with `lang=bg` regardless of the UI culture, so we must OVERRIDE
 * it (not just add when missing) to get the gateway in the chosen language.
 *
 * Verified against prod-bg.tecspayment.com: it reads `lang` and renders English
 * for `lang=en` / Bulgarian for `lang=bg`, and the request signature does not
 * cover `lang`, so overriding it is safe. We also set `language`/`lng` as
 * harmless fallbacks for other gateways.
 */
export function appendLanguageToUrl(rawUrl: string, lang: string): string {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    for (const param of ['lang', 'language', 'lng']) {
      url.searchParams.set(param, lang);
    }
    return url.toString();
  } catch {
    // Not an absolute URL — leave it untouched
    return rawUrl;
  }
}
