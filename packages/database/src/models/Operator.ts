import mongoose, { Schema, Document } from 'mongoose';

export interface IOperator extends Document {
  name: string;
  email: string;
  apiKey: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OperatorSchema = new Schema<IOperator>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    apiKey: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Operator = mongoose.model<IOperator>('Operator', OperatorSchema);
