export interface PurchaseParams {
  vehicleType: 'light' | 'trailer';
  vignetteType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'weekend';
  vehicleCountry: string;
  plateNumber: string;
  validityStartDate: string;
  validityStartTime: string;
  email: string;
}

export interface PurchaseResult {
  success: boolean;
  paymentUrl?: string;
  paymentUrlExpiry?: Date;
  orderId?: string;
  priceEUR?: number;
  priceBGN?: number;
  validityEnd?: Date;
  error?: string;
  screenshots?: Buffer[];
}

export interface VerificationParams {
  vehicleCountry: string;
  plateNumber: string;
  status?: 'active' | 'expired' | 'unused';
}

/**
 * A single vignette record as listed on the BGToll TollProduct page.
 * One license plate can have several (e.g. an expired one plus an active one).
 */
export interface VignetteRecord {
  /** BGToll Id Number, e.g. "26060562638274" */
  idNumber?: string;
  vehicleClass?: string;
  emissionClass?: string;
  numberOfAxles?: string;
  co2Class?: string;
  validFrom?: Date;
  validTo?: Date;
  /** Raw price cell, e.g. "49,60 € (97,00 лв.)" */
  amount?: string;
  priceEUR?: number;
  priceBGN?: number;
  /** Normalized status: active | expired | unused | unknown */
  status?: 'active' | 'expired' | 'unused' | 'unknown';
  /** Original status label as shown on the site, e.g. "Active" / "Активен" */
  statusLabel?: string;
}

export interface VerificationResult {
  /** True if the plate has at least one vignette of any status */
  found: boolean;
  /** True if at least one vignette is currently active */
  isActive?: boolean;
  /** Full list of vignettes for the plate (all statuses) */
  vignettes?: VignetteRecord[];
  /** Convenience pointer to the active vignette, if any */
  activeVignette?: VignetteRecord;
  // --- Deprecated single-record fields, kept for backward compatibility ---
  /** @deprecated use activeVignette/vignettes — was mislabeled as "productType" */
  validFrom?: Date;
  /** @deprecated use activeVignette/vignettes */
  validTo?: Date;
  /** @deprecated this was actually the Id Number, not a product type */
  productType?: string;
  error?: string;
}

export interface IVignetteProvider {
  readonly name: string;
  readonly country: string;
  readonly baseUrl: string;

  purchase(params: PurchaseParams): Promise<PurchaseResult>;
  verify(params: VerificationParams): Promise<VerificationResult>;
  healthCheck(): Promise<boolean>;
}
