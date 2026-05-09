import { Page } from 'playwright';
import { BGTOLL_BASE_URL } from '../config/urls';

const LANGUAGE_CODES: Record<string, string> = {
  en: 'en-US',
  bg: 'bg-BG',
  de: 'de-DE',
  ru: 'ru-RU',
  tr: 'tr-TR',
  el: 'el-GR',
  sr: 'sr-Latn-RS',
  ro: 'ro-RO',
};

export async function switchLanguage(page: Page, lang: string): Promise<void> {
  const cultureCode = LANGUAGE_CODES[lang] || 'en-US';

  // BGToll uses a form post to /Localization/ChangeCulture with culture radio value
  await page.goto(`${BGTOLL_BASE_URL}`);
  await page.waitForLoadState('networkidle');

  // Check if already in correct language by looking for English-specific text
  const pageContent = await page.content();
  if (lang === 'en' && pageContent.includes('Electronic vignette')) {
    return; // Already in English
  }

  // Click the language option
  const langRadio = page.locator(`input[type="radio"][value="${cultureCode}"]`);
  if (await langRadio.isVisible().catch(() => false)) {
    await langRadio.click();
    await page.waitForLoadState('networkidle');
  } else {
    // Try submitting the culture change form directly
    await page.evaluate((culture) => {
      const form = document.querySelector('form[action*="ChangeCulture"]') as HTMLFormElement;
      if (form) {
        const input = form.querySelector('input[type="radio"]') as HTMLInputElement;
        if (input) {
          input.value = culture;
          form.submit();
        }
      }
    }, cultureCode);
    await page.waitForLoadState('networkidle');
  }
}
