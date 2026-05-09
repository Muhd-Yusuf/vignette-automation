import mongoose from 'mongoose';

export async function connectDB(uri?: string): Promise<typeof mongoose> {
  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/vignette_automation';

  const connection = await mongoose.connect(mongoUri);
  console.log(`MongoDB connected: ${connection.connection.host}`);
  return connection;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
