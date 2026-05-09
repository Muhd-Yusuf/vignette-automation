import mongoose, { Schema, Document } from 'mongoose';

export interface IVerification extends Document {
  country: string;
  vehicleCountry: string;
  plateNumber: string;
  isActive?: boolean;
  validFrom?: Date;
  validTo?: Date;
  productType?: string;
  rawResponse?: Record<string, unknown>;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
}

const VerificationSchema = new Schema<IVerification>(
  {
    country: { type: String, required: true },
    vehicleCountry: { type: String, required: true },
    plateNumber: { type: String, required: true, uppercase: true },
    isActive: { type: Boolean },
    validFrom: { type: Date },
    validTo: { type: Date },
    productType: { type: String },
    rawResponse: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

VerificationSchema.index({ plateNumber: 1, vehicleCountry: 1 });

export const Verification = mongoose.model<IVerification>('Verification', VerificationSchema);
