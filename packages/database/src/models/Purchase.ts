import mongoose, { Schema, Document } from 'mongoose';

export interface IPurchase extends Document {
  country: string;
  provider: string;
  vehicleType: 'light' | 'trailer';
  vignetteType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'weekend';
  vehicleCountry: string;
  plateNumber: string;
  validityStartDate: Date;
  validityEndDate?: Date;
  email: string;
  paymentUrl?: string;
  paymentUrlExpiry?: Date;
  priceEUR?: number;
  priceBGN?: number;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  verifiedAt?: Date;
  vignetteNumber?: string;
  callbackUrl?: string;
  callbackSentAt?: Date;
  metadata?: Record<string, unknown>;
  operatorId?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseSchema = new Schema<IPurchase>(
  {
    country: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    vehicleType: { type: String, enum: ['light', 'trailer'], required: true },
    vignetteType: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'weekend'],
      required: true,
    },
    vehicleCountry: { type: String, required: true },
    plateNumber: { type: String, required: true, uppercase: true },
    validityStartDate: { type: Date, required: true },
    validityEndDate: { type: Date },
    email: { type: String, required: true },
    paymentUrl: { type: String },
    paymentUrlExpiry: { type: Date },
    priceEUR: { type: Number },
    priceBGN: { type: Number },
    status: {
      type: String,
      enum: ['queued', 'processing', 'awaiting_payment', 'payment_completed', 'verified', 'failed', 'cancelled', 'expired'],
      default: 'queued',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastError: { type: String },
    verifiedAt: { type: Date },
    vignetteNumber: { type: String },
    callbackUrl: { type: String },
    callbackSentAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
    operatorId: { type: String, index: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

PurchaseSchema.index({ plateNumber: 1, vehicleCountry: 1 });
PurchaseSchema.index({ createdAt: -1 });

export const Purchase = mongoose.model<IPurchase>('Purchase', PurchaseSchema);
