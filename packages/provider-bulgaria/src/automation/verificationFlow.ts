import { Page } from 'playwright';
import { VerificationParams, VerificationResult } from '@vignette/core';
import { SELECTORS } from '../config/selectors';
import { BGTOLL_BASE_URL, BGTOLL_URLS } from '../config/urls';
import { CaptchaSolver } from '../captcha/captchaSolver';

export async function verifyVignette(
  page: Page,
  params: VerificationParams,
  captchaSolver: CaptchaSolver
): Promise<VerificationResult> {
  // Navigate to verification page
  await page.goto(`${BGTOLL_BASE_URL}${BGTOLL_URLS.verification}`);
  await page.waitForLoadState('networkidle');

  // 1. Select country
  const countrySelect = page.locator(SELECTORS.verifyCountryDropdown).first();
  await countrySelect.waitFor({ state: 'visible' });

  try {
    await countrySelect.selectOption({ value: params.vehicleCountry.toUpperCase() });
  } catch {
    // Try selecting by label text
    await countrySelect.selectOption({ label: params.vehicleCountry });
  }

  // 2. Fill plate number
  const plateInput = page.locator(SELECTORS.verifyPlateInput).first();
  await plateInput.waitFor({ state: 'visible' });
  await plateInput.fill(params.plateNumber.toUpperCase());

  // 3. Select status filter (default: active)
  const status = params.status || 'active';
  const statusRadio = page.locator(SELECTORS.verifyStatusRadio(status));
  if (await statusRadio.isVisible().catch(() => false)) {
    await statusRadio.click();
  }

  // 4. Bypass reCAPTCHA using stealth (no paid service)
  await captchaSolver.solveOnPage(page);

  // 5. Click search
  const searchBtn = page.locator(SELECTORS.verifySearchButton).first();
  await searchBtn.click();

  // Wait for results
  await page.waitForTimeout(3000);

  // 6. Parse results
  const hasError = await page.locator(SELECTORS.errorMessage).isVisible().catch(() => false);
  if (hasError) {
    const errorText = await page.locator(SELECTORS.errorMessage).first().textContent();
    return { found: false, error: errorText || 'Verification failed' };
  }

  // Check if results table has data
  const resultsTable = page.locator(SELECTORS.verifyResultsTable).first();
  const tableVisible = await resultsTable.isVisible().catch(() => false);

  if (!tableVisible) {
    return { found: false };
  }

  // Parse table rows
  const rows = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];

    const tbody = table.querySelector('tbody');
    const trs = tbody ? tbody.querySelectorAll('tr') : table.querySelectorAll('tr:not(:first-child)');

    return Array.from(trs).map((row) => {
      const cells = row.querySelectorAll('td');
      return Array.from(cells).map((cell) => cell.textContent?.trim() || '');
    });
  });

  if (rows.length === 0) {
    return { found: false };
  }

  // Parse first result row (adjust column indices based on actual table structure)
  const firstRow = rows[0];
  return {
    found: true,
    isActive: firstRow.some((cell) => cell.toLowerCase().includes('active')),
    productType: firstRow[0] || undefined,
    validFrom: firstRow[1] ? parseBGDate(firstRow[1]) : undefined,
    validTo: firstRow[2] ? parseBGDate(firstRow[2]) : undefined,
  };
}

function parseBGDate(dateStr: string): Date | undefined {
  // BGToll dates may be in format DD.MM.YYYY HH:mm or DD/MM/YYYY
  const parts = dateStr.match(/(\d{2})[./](\d{2})[./](\d{4})\s*(\d{2}:\d{2})?/);
  if (!parts) return undefined;

  const [, day, month, year, time] = parts;
  const isoStr = `${year}-${month}-${day}${time ? `T${time}:00` : ''}`;
  const date = new Date(isoStr);
  return isNaN(date.getTime()) ? undefined : date;
}
