import { FastifyInstance } from 'fastify';
import { VIGNETTE_PRICES } from '@vignette/provider-bulgaria';

export async function configRoutes(app: FastifyInstance) {
  // Root → send people to the interactive docs (friendly landing instead of 404)
  app.get('/', { schema: { hide: true } }, async (_req, reply) => reply.redirect('/docs'));

  // API base prefix → helpful index instead of a bare 404
  app.get('/api/v1', {
    schema: {
      tags: ['config'],
      summary: 'API index',
      description: 'Landing response for the API base path; lists available endpoints and docs.',
    },
  }, async (request) => {
    const base = `${request.protocol}://${request.host}`;
    return {
      name: 'Vignette Automation API',
      version: '1.0.0',
      status: 'ok',
      documentation: `${base}/docs`,
      openapi: `${base}/docs/json`,
      endpoints: {
        health: 'GET /api/v1/health',
        verify: 'POST /api/v1/verify  ·  GET /api/v1/verify/{id}',
        checkPeriod: 'POST /api/v1/check-period  ·  GET /api/v1/check-period/{id}',
        purchases: 'POST /api/v1/purchases  ·  GET /api/v1/purchases  ·  GET /api/v1/purchases/{id}',
        config: 'GET /api/v1/config/vignette-types',
        stats: 'GET /api/v1/stats',
      },
    };
  });

  // Get available vignette types and prices
  app.get('/api/v1/config/vignette-types', {
    schema: { tags: ['config'], summary: 'Vehicle/vignette types and prices' },
  }, async () => {
    return {
      bulgaria: {
        provider: 'bgtoll',
        vehicleTypes: [
          { id: 'light', label: 'Light vehicle (≤3.5t)' },
          { id: 'trailer', label: 'Trailer (combined >3.5t)' },
        ],
        vignetteTypes: Object.entries(VIGNETTE_PRICES).map(([type, prices]: [string, { eur: number; bgn: number }]) => ({
          id: type,
          label: type.charAt(0).toUpperCase() + type.slice(1),
          priceEUR: prices.eur,
          priceBGN: prices.bgn,
        })),
      },
    };
  });

  // Health check
  app.get('/api/v1/health', {
    schema: { tags: ['config'], summary: 'Health check' },
  }, async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Stats for dashboard
  app.get('/api/v1/stats', {
    schema: { tags: ['config'], summary: 'Dashboard purchase stats' },
  }, async () => {
    const { Purchase } = await import('@vignette/database');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalToday, totalPending, totalFailed, totalCompleted] = await Promise.all([
      Purchase.countDocuments({ createdAt: { $gte: today } }),
      Purchase.countDocuments({ status: { $in: ['queued', 'processing', 'awaiting_payment'] } }),
      Purchase.countDocuments({ status: 'failed', createdAt: { $gte: today } }),
      Purchase.countDocuments({ status: { $in: ['payment_completed', 'verified'] } }),
    ]);

    return {
      today: totalToday,
      pending: totalPending,
      failed: totalFailed,
      totalCompleted,
    };
  });
}
