import mongoose, { Schema, Document } from 'mongoose';

export interface IVerification extends Document {
  country: string;
  vehicleCountry: string;
  plateNumber: string;
  isActive?: boolean;
  /** Full list of vignettes returned for the plate (all statuses) */
  vignettes?: Record<string, unknown>[];
  validFrom?: Date;
  validTo?: Date;
  productType?: string;
  rawResponse?: Record<string, unknown>;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  finalizedAt?: Date;
}

const VerificationSchema = new Schema<IVerification>(
  {
    country: { type: String, required: true },
    vehicleCountry: { type: String, required: true },
    plateNumber: { type: String, required: true, uppercase: true },
    isActive: { type: Boolean },
    vignettes: { type: [Schema.Types.Mixed], default: undefined },
    validFrom: { type: Date },
    validTo: { type: Date },
    productType: { type: String },
    rawResponse: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    error: { type: String },
    finalizedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

VerificationSchema.index({ plateNumber: 1, vehicleCountry: 1 });

export const Verification = mongoose.model<IVerification>('Verification', VerificationSchema);
