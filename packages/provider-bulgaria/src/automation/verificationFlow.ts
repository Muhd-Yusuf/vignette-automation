import { Page } from 'playwright';
import { VerificationParams, VerificationResult, VignetteRecord } from '@vignette/core';
import { BGTOLL_BASE_URL, BGTOLL_URLS } from '../config/urls';
import { CaptchaSolver } from '../captcha/captchaSolver';

export async function verifyVignette(
  page: Page,
  params: VerificationParams,
  captchaSolver: CaptchaSolver
): Promise<VerificationResult> {
  // Navigate to verification page
  console.log('[BGToll Verify] Navigating to verification page...');
  await page.goto(`${BGTOLL_BASE_URL}${BGTOLL_URLS.verification}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  // Bound the idle wait — the reCAPTCHA widget keeps the network busy, so
  // 'networkidle' may never fire and would otherwise block the full timeout.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  // 1. Select country
  console.log('[BGToll Verify] Selecting country:', params.vehicleCountry);
  const countrySelect = page.locator('#ddlVehicleNationality').first();
  await countrySelect.waitFor({ state: 'visible', timeout: 10000 });

  try {
    await countrySelect.selectOption({ value: params.vehicleCountry.toUpperCase() });
  } catch {
    // Try selecting by label text
    await countrySelect.selectOption({ label: params.vehicleCountry });
  }

  await page.waitForTimeout(500);

  // 2. Fill plate number
  console.log('[BGToll Verify] Filling plate:', params.plateNumber);
  const plateInput = page.locator('#txtLicensePlateNumber').first();
  await plateInput.waitFor({ state: 'visible' });
  await plateInput.fill(params.plateNumber.toUpperCase());

  // 3. Solve reCAPTCHA
  console.log('[BGToll Verify] Solving CAPTCHA...');
  const captchaSolved = await captchaSolver.solveOnPage(page);
  if (!captchaSolved) {
    return { found: false, error: 'CAPTCHA solving failed' };
  }

  // 4. Click search using JS click (bypass any overlays)
  console.log('[BGToll Verify] Submitting search...');
  await page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"], #btnSearch, .btn-primary'
    );
    if (btn) btn.click();
  });

  // Wait for results to render — resolve as soon as a results row OR an error/
  // no-data message appears instead of blocking on a fixed 5s timeout.
  await Promise.race([
    page
      .waitForSelector(
        'table tbody tr td, #txtCaptchaError:not(.d-none), .validation-summary-errors, .alert-danger',
        { state: 'attached', timeout: 20000 }
      )
      .catch(() => {}),
    page.waitForTimeout(20000),
  ]);
  // Small settle for any post-render row population
  await page.waitForTimeout(500);

  console.log('[BGToll Verify] After search, URL:', page.url());

  // 5. Check for errors using specific error elements
  // IMPORTANT: Only check VISIBLE error elements — many error spans always have text but are hidden with d-none
  const errorInfo = await page.evaluate(() => {
    // Check for CAPTCHA error — only if the element is VISIBLE (no d-none class)
    const captchaError = document.getElementById('txtCaptchaError');
    if (captchaError && !captchaError.classList.contains('d-none') && captchaError.textContent?.trim()) {
      return { type: 'captcha', msg: captchaError.textContent.trim() };
    }

    // Check for visible validation errors
    const validationErrors = document.querySelector('.validation-summary-errors, .alert-danger');
    if (validationErrors && validationErrors.textContent?.trim() &&
        getComputedStyle(validationErrors).display !== 'none') {
      return { type: 'validation', msg: validationErrors.textContent.trim() };
    }

    // Check for "no results" messages
    const body = document.body.innerText || '';
    if (body.includes('No data found') || body.includes('Няма намерени данни') ||
        body.includes('no records') || body.includes('Няма намерени')) {
      return { type: 'no_results', msg: '' };
    }

    return null;
  });

  if (errorInfo?.type === 'captcha') {
    return { found: false, error: `CAPTCHA error: ${errorInfo.msg}` };
  }

  if (errorInfo?.type === 'validation') {
    return { found: false, error: `Validation error: ${errorInfo.msg}` };
  }

  const noResults = errorInfo?.type === 'no_results';

  if (noResults) {
    return { found: false };
  }

  // 6. Parse results table — extract BOTH the header labels and every data row.
  // The TollProduct table can contain MULTIPLE vignettes for one plate (e.g. an
  // expired one AND a currently-active one). We must read all rows and map columns
  // by their header name rather than by fixed index, since column order/visibility
  // can vary by locale.
  const table = await page.evaluate(() => {
    const el = document.querySelector('table');
    if (!el) return null;

    const headerCells = Array.from(el.querySelectorAll('thead th, thead td'))
      .map((c) => c.textContent?.trim() || '');

    const tbody = el.querySelector('tbody');
    const trs = tbody
      ? Array.from(tbody.querySelectorAll('tr'))
      : Array.from(el.querySelectorAll('tr')).slice(1);

    const rows = trs
      .map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() || ''))
      // Drop empty / "no data" placeholder rows
      .filter((cells) => cells.some((c) => c.length > 0) && cells.length > 1);

    return { headerCells, rows };
  });

  if (!table || table.rows.length === 0) {
    return { found: false };
  }

  const colIndex = buildColumnIndex(table.headerCells);
  const vignettes: VignetteRecord[] = table.rows.map((cells) =>
    parseVignetteRow(cells, colIndex)
  );

  console.log('[BGToll Verify] Found', vignettes.length, 'vignette(s)');

  const activeVignette = vignettes.find((v) => v.status === 'active');

  return {
    found: vignettes.length > 0,
    isActive: !!activeVignette,
    vignettes,
    activeVignette,
    // Backward-compatible fields point at the active record (or the first one)
    productType: (activeVignette ?? vignettes[0]).idNumber,
    validFrom: (activeVignette ?? vignettes[0]).validFrom,
    validTo: (activeVignette ?? vignettes[0]).validTo,
  };
}

/**
 * Maps a logical column name to its index in the results table by matching
 * keywords against the header labels. Falls back to the known default order
 * used by web.bgtoll.bg/TollProduct when no header is present.
 */
function buildColumnIndex(headerCells: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  const find = (...keywords: string[]) =>
    headerCells.findIndex((h) => {
      const lower = h.toLowerCase();
      return keywords.some((k) => lower.includes(k));
    });

  idx.idNumber = find('id number', 'id номер', 'номер на', 'id ');
  idx.vehicleClass = find('vehicle class', 'категория', 'превозно');
  idx.emissionClass = find('emission', 'емисион');
  idx.numberOfAxles = find('axle', 'оси', 'брой оси');
  idx.co2Class = find('co2', 'co₂');
  idx.validFrom = find('validity start', 'start date', 'начало', 'валидност от');
  idx.validTo = find('expiration', 'end date', 'край', 'валидност до');
  idx.amount = find('amount', 'price', 'сума', 'цена');
  idx.status = find('status', 'статус', 'състояние');

  // Fallback to the documented default column order if header parsing failed
  const defaults: Record<string, number> = {
    idNumber: 0,
    vehicleClass: 1,
    emissionClass: 2,
    numberOfAxles: 3,
    co2Class: 4,
    validFrom: 5,
    validTo: 6,
    amount: 7,
    status: 8,
  };
  for (const key of Object.keys(defaults)) {
    if (idx[key] === undefined || idx[key] < 0) idx[key] = defaults[key];
  }
  return idx;
}

function parseVignetteRow(cells: string[], col: Record<string, number>): VignetteRecord {
  const cell = (i: number) => (i >= 0 && i < cells.length ? cells[i] : '');
  const statusLabel = cell(col.status);
  const amount = cell(col.amount);
  const prices = parsePrices(amount);

  return {
    idNumber: cell(col.idNumber) || undefined,
    vehicleClass: cell(col.vehicleClass) || undefined,
    emissionClass: cell(col.emissionClass) || undefined,
    numberOfAxles: cell(col.numberOfAxles) || undefined,
    co2Class: cell(col.co2Class) || undefined,
    validFrom: parseBGDate(cell(col.validFrom)),
    validTo: parseBGDate(cell(col.validTo)),
    amount: amount || undefined,
    priceEUR: prices.eur,
    priceBGN: prices.bgn,
    statusLabel: statusLabel || undefined,
    status: normalizeStatus(statusLabel),
  };
}

function normalizeStatus(label: string): VignetteRecord['status'] {
  const s = label.toLowerCase();
  if (s.includes('active') || s.includes('активен') || s.includes('активна')) return 'active';
  if (s.includes('expired') || s.includes('изтек')) return 'expired';
  if (s.includes('unused') || s.includes('неизполз') || s.includes('бъдещ')) return 'unused';
  return label ? 'unknown' : undefined;
}

/** Parses a BGToll amount cell like "49,60 € (97,00 лв.)" into EUR/BGN numbers. */
function parsePrices(amount: string): { eur?: number; bgn?: number } {
  if (!amount) return {};
  const num = (re: RegExp): number | undefined => {
    const m = amount.match(re);
    if (!m) return undefined;
    const v = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
    return isNaN(v) ? undefined : v;
  };
  return {
    eur: num(/([\d.,\s]+)\s*€/),
    bgn: num(/([\d.,\s]+)\s*(?:лв|bgn)/i),
  };
}

function parseBGDate(dateStr: string): Date | undefined {
  const parts = dateStr.match(/(\d{2})[./](\d{2})[./](\d{4})\s*(\d{2}:\d{2})?/);
  if (!parts) return undefined;

  const [, day, month, year, time] = parts;
  const isoStr = `${year}-${month}-${day}${time ? `T${time}:00` : ''}`;
  const date = new Date(isoStr);
  return isNaN(date.getTime()) ? undefined : date;
}
