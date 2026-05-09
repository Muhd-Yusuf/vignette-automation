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

export interface VerificationResult {
  found: boolean;
  isActive?: boolean;
  validFrom?: Date;
  validTo?: Date;
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
