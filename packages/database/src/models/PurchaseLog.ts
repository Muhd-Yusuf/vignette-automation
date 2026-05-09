import mongoose, { Schema, Document } from 'mongoose';

export interface IPurchaseLog extends Document {
  purchaseId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  step: string;
  message: string;
  duration?: number;
  data?: Record<string, unknown>;
  createdAt: Date;
}

const PurchaseLogSchema = new Schema<IPurchaseLog>(
  {
    purchaseId: { type: String, required: true, index: true },
    level: { type: String, enum: ['debug', 'info', 'warn', 'error'], required: true },
    step: { type: String, required: true },
    message: { type: String, required: true },
    duration: { type: Number },
    data: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PurchaseLogSchema.index({ createdAt: -1 });

export const PurchaseLog = mongoose.model<IPurchaseLog>('PurchaseLog', PurchaseLogSchema);
