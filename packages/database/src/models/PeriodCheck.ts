import mongoose, { Schema, Document } from 'mongoose';

export interface IPeriodCheck extends Document {
  country: string;
  vehicleCountry: string;
  plateNumber: string;
  vehicleType: string;
  vignetteType: string;
  validityStartDate: Date;
  validityStartTime?: string;
  status: 'pending' | 'completed' | 'failed';
  purchasable?: boolean;
  isOverlapping?: boolean;
  hasExactMatching?: boolean;
  isCloseToEndDay?: boolean;
  message?: string;
  overlappingVignettes?: Record<string, unknown>[];
  error?: string;
  createdAt: Date;
  finalizedAt?: Date;
}

const PeriodCheckSchema = new Schema<IPeriodCheck>(
  {
    country: { type: String, required: true },
    vehicleCountry: { type: String, required: true, uppercase: true },
    plateNumber: { type: String, required: true, uppercase: true },
    vehicleType: { type: String, required: true },
    vignetteType: { type: String, required: true },
    validityStartDate: { type: Date, required: true },
    validityStartTime: { type: String },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    purchasable: { type: Boolean },
    isOverlapping: { type: Boolean },
    hasExactMatching: { type: Boolean },
    isCloseToEndDay: { type: Boolean },
    message: { type: String },
    overlappingVignettes: { type: [Schema.Types.Mixed], default: undefined },
    error: { type: String },
    finalizedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PeriodCheck = mongoose.model<IPeriodCheck>('PeriodCheck', PeriodCheckSchema);
