import { FastifyInstance } from 'fastify';
import { VIGNETTE_PRICES } from '@vignette/provider-bulgaria';

export async function configRoutes(app: FastifyInstance) {
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
