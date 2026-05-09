export const PURCHASE_STATUSES = [
  'queued',
  'processing',
  'awaiting_payment',
  'payment_completed',
  'verified',
  'failed',
  'cancelled',
  'expired',
] as const;

export const VEHICLE_TYPES = ['light', 'trailer'] as const;

export const VIGNETTE_TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'weekend'] as const;

export const SUPPORTED_COUNTRIES = ['bulgaria', 'romania', 'hungary'] as const;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
