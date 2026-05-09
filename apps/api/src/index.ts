import Fastify from 'fastify';
import cors from '@fastify/cors';
import { connectDB } from '@vignette/database';
import { config } from './config';
import { initQueues } from './services/queueService';
import { purchaseRoutes } from './routes/purchases';
import { verificationRoutes } from './routes/verification';
import { configRoutes } from './routes/config';

async function main() {
  const app = Fastify({ logger: true });

  // Plugins
  await app.register(cors, { origin: config.cors.origin });

  // Connect to MongoDB
  await connectDB(config.mongodbUri);

  // Initialize queues
  initQueues();

  // Register routes
  await app.register(purchaseRoutes);
  await app.register(verificationRoutes);
  await app.register(configRoutes);

  // Global error handler
  app.setErrorHandler((error: Error & { name?: string }, request, reply) => {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        error: 'Validation failed',
        details: JSON.parse(error.message),
      });
    }

    app.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  });

  // Start
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`API server running on port ${config.port}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
