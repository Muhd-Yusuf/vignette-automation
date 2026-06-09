export const BGTOLL_BASE_URL = 'https://web.bgtoll.bg';

export const BGTOLL_URLS = {
  home: '/',
  changeLang: '/Localization/ChangeCulture',
  validityPeriod: (vehicleTypeId: number) =>
    `/Evignette/ValidityPeriod?vignetteVehicleTypeID=${vehicleTypeId}`,
  verification: '/TollProduct',
  login: '/RoadUserAccount/Login',
} as const;

export const VEHICLE_TYPE_IDS = {
  light: 1,
  trailer: 2,
} as const;

// Maps our vignette type names to BGToll's internal vignetteTypeID values
// These IDs appear in the link hrefs on the ValidityPeriod page: /Evignette/Create?vignetteTypeID=X
export const VIGNETTE_TYPE_IDS: Record<string, number> = {
  daily: 27,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  annual: 4,
  weekend: 5,
};

export const VIGNETTE_PRICES: Record<string, { eur: number; bgn: number }> = {
  daily: { eur: 4.09, bgn: 8 },
  weekly: { eur: 7.67, bgn: 15 },
  monthly: { eur: 15.34, bgn: 30 },
  quarterly: { eur: 27.61, bgn: 54 },
  annual: { eur: 49.60, bgn: 97 },
  weekend: { eur: 5.11, bgn: 10 },
};

// Known Bulgarian payment gateway domains
export const PAYMENT_GATEWAY_PATTERNS = [
  'epay.bg',
  'borica.bg',
  'dskdirect.bg',
  'fibank.bg',
  'unicreditbulbank.bg',
  '3dsecure',
  'securepay',
  'payment',
  'pay.egov.bg',
];
