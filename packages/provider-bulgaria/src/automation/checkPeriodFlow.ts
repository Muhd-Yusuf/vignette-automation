import { Page } from 'playwright';
import { CheckPeriodResult, OverlappingVignette } from '@vignette/core';

/**
 * Calls BGToll's POST /Evignette/CheckPeriod endpoint — the same pre-validation
 * the public form runs when a plate + date is entered, BEFORE the reCAPTCHA and
 * final submit. It tells us whether the plate can be purchased for the requested
 * period (and surfaces any overlapping/exact-match vignettes), so we can fail a
 * purchase early instead of burning a CAPTCHA solve on a request the site will reject.
 *
 * Requires the Create page to be loaded first so we can read the anti-forgery
 * token and the resolved vignette type ids, and so the request carries the
 * session cookies.
 *
 * @param page  A page already navigated to /Evignette/Create?vignetteTypeID=...
 */
export async function checkPeriodOnPage(
  page: Page,
  params: {
    vehicleCountry: string;
    plateNumber: string;
    validityStartDate: string;
    validityStartTime?: string;
  }
): Promise<CheckPeriodResult> {
  const raw = await page.evaluate(
    async ({ plate, country, dateISO, time }) => {
      const token =
        (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value || '';
      const vignetteTypeId = (document.getElementById('hdnVignetteTypeID') as HTMLInputElement | null)?.value || '';
      const vignetteValidityTypeId =
        (document.getElementById('hdnVignetteValidityTypeID') as HTMLInputElement | null)?.value || '';

      // BGToll's own JS sends the date as JS Date.toDateString() (e.g. "Sun Jun 15 2026")
      const requestDate = new Date(dateISO).toDateString();

      const body = new URLSearchParams({
        __RequestVerificationToken: token,
        requestDate,
        requestTime: time || '00:00',
        vignetteValidityTypeId,
        vignetteTypeId,
        licensePlateNumber: plate.toUpperCase(),
        vehicleNationalityId: country.toUpperCase(),
      });

      const res = await fetch('/Evignette/CheckPeriod', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
      });

      const text = await res.text();
      return { status: res.status, text };
    },
    {
      plate: params.plateNumber,
      country: params.vehicleCountry,
      dateISO: params.validityStartDate,
      time: params.validityStartTime,
    }
  );

  if (raw.status !== 200) {
    return {
      purchasable: false,
      isOverlapping: false,
      hasExactMatching: false,
      isCloseToEndDay: false,
      overlappingVignettes: [],
      error: `CheckPeriod returned HTTP ${raw.status}`,
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw.text);
  } catch {
    return {
      purchasable: false,
      isOverlapping: false,
      hasExactMatching: false,
      isCloseToEndDay: false,
      overlappingVignettes: [],
      error: 'CheckPeriod returned a non-JSON response',
    };
  }

  const result = parsed.result || {};
  const hasExactMatching = !!result.HasExactMatching;
  const isOverlapping = !!result.IsOverlapping;
  const isCloseToEndDay = !!result.IsCloseToEndDay;

  const overlappingVignettes: OverlappingVignette[] = (result.OverlappingVignettes || []).map((v: any) => ({
    vignetteNumber: v.VignetteNumber != null ? String(v.VignetteNumber) : undefined,
    validityType: v.VignetteValidityTypeDescriptionTTD || undefined,
    vehicleType: v.VignetteVehicleTypeDescription || undefined,
    validFrom: parseDotDate(v.ValidityStartDateTimeString),
    validTo: parseDotDate(v.ValidityEndDateTimeString),
    amount: stripHtml(v.AmountFormatted),
    status: v.Status || undefined,
    exactMatch: v.ExactMatch === true || v.ExactMatch === 'true',
  }));

  return {
    // A purchase is blocked only by an exact match; overlap alone is a soft warning.
    purchasable: !hasExactMatching,
    isOverlapping,
    hasExactMatching,
    isCloseToEndDay,
    message: parsed.messageError || undefined,
    overlappingVignettes,
  };
}

function parseDotDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return undefined;
  const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);
  return isNaN(d.getTime()) ? undefined : d;
}

function stripHtml(s?: string): string | undefined {
  if (!s) return undefined;
  return s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
}
