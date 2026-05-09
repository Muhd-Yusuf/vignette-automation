import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Purchase } from '@vignette/database';
import { getPurchaseQueue } from '../services/queueService';

const purchaseSchema = z.object({
  country: z.string().default('bulgaria'),
  vehicleType: z.enum(['light', 'trailer']),
  vignetteType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'weekend']),
  vehicleCountry: z.string().min(2).max(3),
  plateNumber: z.string().min(1).max(20),
  validityStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validityStartTime: z.string().regex(/^\d{2}:\d{2}$/).default('00:00'),
  email: z.string().email(),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function purchaseRoutes(app: FastifyInstance) {
  // Create a new purchase
  app.post('/api/v1/purchases', async (request, reply) => {
    const body = purchaseSchema.parse(request.body);

    // Create purchase record
    const purchase = await Purchase.create({
      country: body.country,
      provider: 'bgtoll',
      vehicleType: body.vehicleType,
      vignetteType: body.vignetteType,
      vehicleCountry: body.vehicleCountry.toUpperCase(),
      plateNumber: body.plateNumber.toUpperCase(),
      validityStartDate: new Date(body.validityStartDate),
      email: body.email,
      callbackUrl: body.callbackUrl,
      metadata: body.metadata,
      status: 'queued',
    });

    // Add to processing queue
    const queue = getPurchaseQueue();
    await queue.add(
      'purchase-vignette',
      {
        purchaseId: purchase._id.toString(),
        ...body,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    return reply.status(202).send({
      id: purchase._id,
      status: purchase.status,
      createdAt: purchase.createdAt,
      estimatedCompletionSeconds: 60,
    });
  });

  // Get purchase by ID
  app.get('/api/v1/purchases/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const purchase = await Purchase.findById(id);
    if (!purchase) {
      return reply.status(404).send({ error: 'Purchase not found' });
    }

    return {
      id: purchase._id,
      status: purchase.status,
      paymentUrl: purchase.paymentUrl,
      paymentUrlExpiresAt: purchase.paymentUrlExpiry?.toISOString(),
      vignetteDetails: {
        type: purchase.vignetteType,
        vehicleCountry: purchase.vehicleCountry,
        plateNumber: purchase.plateNumber,
        validFrom: purchase.validityStartDate.toISOString(),
        validTo: purchase.validityEndDate?.toISOString(),
        priceEUR: purchase.priceEUR,
        priceBGN: purchase.priceBGN,
      },
      attempts: purchase.attempts,
      error: purchase.lastError,
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    };
  });

  // List purchases
  app.get('/api/v1/purchases', async (request) => {
    const { status, page = '1', limit = '20' } = request.query as {
      status?: string;
      page?: string;
      limit?: string;
    };

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [purchases, total] = await Promise.all([
      Purchase.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Purchase.countDocuments(filter),
    ]);

    return {
      data: purchases.map((p) => ({
        id: p._id,
        status: p.status,
        country: p.country,
        plateNumber: p.plateNumber,
        vignetteType: p.vignetteType,
        paymentUrl: p.paymentUrl,
        priceEUR: p.priceEUR,
        createdAt: p.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  });

  // Cancel a purchase
  app.post('/api/v1/purchases/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };

    const purchase = await Purchase.findById(id);
    if (!purchase) {
      return reply.status(404).send({ error: 'Purchase not found' });
    }

    if (!['queued', 'processing'].includes(purchase.status)) {
      return reply.status(400).send({ error: 'Cannot cancel purchase in current state' });
    }

    purchase.status = 'cancelled';
    await purchase.save();

    return { id: purchase._id, status: 'cancelled' };
  });

  // Retry a failed purchase
  app.post('/api/v1/purchases/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };

    const purchase = await Purchase.findById(id);
    if (!purchase) {
      return reply.status(404).send({ error: 'Purchase not found' });
    }

    if (purchase.status !== 'failed') {
      return reply.status(400).send({ error: 'Can only retry failed purchases' });
    }

    purchase.status = 'queued';
    purchase.lastError = undefined;
    await purchase.save();

    const queue = getPurchaseQueue();
    await queue.add(
      'purchase-vignette',
      {
        purchaseId: purchase._id.toString(),
        country: purchase.country,
        vehicleType: purchase.vehicleType,
        vignetteType: purchase.vignetteType,
        vehicleCountry: purchase.vehicleCountry,
        plateNumber: purchase.plateNumber,
        validityStartDate: purchase.validityStartDate.toISOString().split('T')[0],
        validityStartTime: '00:00',
        email: purchase.email,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );

    return { id: purchase._id, status: 'queued' };
  });
}
