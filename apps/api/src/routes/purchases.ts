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
  language: z.enum(['bg', 'en', 'de', 'ru', 'tr', 'el', 'sr', 'ro']).default('en'),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function purchaseRoutes(app: FastifyInstance) {
  // Create a new purchase
  app.post('/api/v1/purchases', {
    schema: {
      tags: ['purchases'],
      summary: 'Create a vignette purchase',
      description:
        'Queues a vignette purchase. Returns an order id; poll GET /api/v1/purchases/{id} ' +
        'until status is "awaiting_payment" (paymentUrl available) or "failed".',
      body: {
        type: 'object',
        required: ['vehicleType', 'vignetteType', 'vehicleCountry', 'plateNumber', 'validityStartDate', 'email'],
        properties: {
          country: { type: 'string', default: 'bulgaria' },
          vehicleType: { type: 'string', enum: ['light', 'trailer'] },
          vignetteType: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'weekend'] },
          vehicleCountry: { type: 'string', minLength: 2, maxLength: 3, description: 'ISO country code, e.g. CZ' },
          plateNumber: { type: 'string', minLength: 1, maxLength: 20, description: 'License plate, e.g. 8C81539' },
          validityStartDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' },
          validityStartTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', default: '00:00' },
          email: { type: 'string', format: 'email' },
          language: {
            type: 'string',
            enum: ['bg', 'en', 'de', 'ru', 'tr', 'el', 'sr', 'ro'],
            default: 'en',
            description: 'UI + payment gateway language',
          },
          callbackUrl: { type: 'string', format: 'uri' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, async (request, reply) => {
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
  app.get('/api/v1/purchases/:id', {
    schema: {
      tags: ['purchases'],
      summary: 'Get a purchase by id',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
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
      finalizedAt: purchase.completedAt,
      durationMs: purchase.completedAt
        ? purchase.completedAt.getTime() - purchase.createdAt.getTime()
        : undefined,
    };
  });

  // List purchases
  app.get('/api/v1/purchases', {
    schema: {
      tags: ['purchases'],
      summary: 'List purchases',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          page: { type: 'string', default: '1' },
          limit: { type: 'string', default: '20' },
        },
      },
    },
  }, async (request) => {
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
  app.post('/api/v1/purchases/:id/cancel', {
    schema: {
      tags: ['purchases'],
      summary: 'Cancel a queued/processing purchase',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
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

  // Clear all orders (delete from database)
  app.delete('/api/v1/purchases', {
    schema: {
      tags: ['purchases'],
      summary: 'Delete all purchases',
      description: 'Destructive: removes every purchase record from the database.',
    },
  }, async (_request, reply) => {
    const result = await Purchase.deleteMany({});
    return reply.send({ deleted: result.deletedCount });
  });

  // Retry a failed purchase
  app.post('/api/v1/purchases/:id/retry', {
    schema: {
      tags: ['purchases'],
      summary: 'Retry a failed purchase',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
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
