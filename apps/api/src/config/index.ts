import 'dotenv/config';

export const config = {
  port: parseInt(process.env.API_PORT || '3001', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vignette_automation',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  apiKeySecret: process.env.API_KEY_SECRET || 'dev-secret',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
};
