export type PurchaseStatus =
  | 'queued'
  | 'processing'
  | 'awaiting_payment'
  | 'payment_completed'
  | 'verified'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type VehicleType = 'light' | 'trailer';

export type VignetteType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'weekend';

export interface VignettePrice {
  eur: number;
  bgn: number;
}

export interface PurchaseRequest {
  country: string;
  vehicleType: VehicleType;
  vignetteType: VignetteType;
  vehicleCountry: string;
  plateNumber: string;
  validityStartDate: string;
  validityStartTime: string;
  email: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PurchaseResponse {
  id: string;
  status: PurchaseStatus;
  paymentUrl?: string;
  paymentUrlExpiresAt?: string;
  vignetteDetails?: {
    type: VignetteType;
    vehicleCountry: string;
    plateNumber: string;
    validFrom: string;
    validTo?: string;
    priceEUR: number;
    priceBGN: number;
  };
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
