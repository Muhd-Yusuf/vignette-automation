import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PeriodCheck } from '@vignette/database';
import { getCheckPeriodQueue } from '../services/queueService';

const checkSchema = z.object({
  country: z.string().default('bulgaria'),
  vehicleType: z.enum(['light', 'trailer']),
  vignetteType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'weekend']),
  vehicleCountry: z.string().min(2).max(3),
  plateNumber: z.string().min(1).max(20),
  validityStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validityStartTime: z.string().regex(/^\d{2}:\d{2}$/).default('00:00'),
});

const overlappingVignetteSchema = {
  type: 'object',
  properties: {
    vignetteNumber: { type: 'string' },
    validityType: { type: 'string' },
    vehicleType: { type: 'string' },
    validFrom: { type: 'string', format: 'date-time', nullable: true },
    validTo: { type: 'string', format: 'date-time', nullable: true },
    amount: { type: 'string' },
    status: { type: 'string' },
    exactMatch: { type: 'boolean' },
  },
};

export async function checkPeriodRoutes(app: FastifyInstance) {
  // Start a pre-purchase period check (mirrors BGToll's POST /Evignette/CheckPeriod)
  app.post('/api/v1/check-period', {
    schema: {
      tags: ['verification'],
      summary: 'Check if a plate can be purchased for a period (pre-validation)',
      description:
        'Runs BGToll\'s CheckPeriod validation BEFORE a purchase. Queues the check and ' +
        'returns an id; poll GET /api/v1/check-period/{id}. Use this to avoid submitting ' +
        'a purchase that BGToll will reject (e.g. the plate already has a matching vignette).',
      body: {
        type: 'object',
        required: ['vehicleType', 'vignetteType', 'vehicleCountry', 'plateNumber', 'validityStartDate'],
        properties: {
          country: { type: 'string', default: 'bulgaria' },
          vehicleType: { type: 'string', enum: ['light', 'trailer'] },
          vignetteType: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'weekend'] },
          vehicleCountry: { type: 'string', minLength: 2, maxLength: 3, description: 'ISO country code' },
          plateNumber: { type: 'string', minLength: 1, maxLength: 20 },
          validityStartDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' },
          validityStartTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', default: '00:00' },
        },
      },
      response: {
        202: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', example: 'pending' },
            estimatedCompletionSeconds: { type: 'integer', example: 15 },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = checkSchema.parse(request.body);

    const check = await PeriodCheck.create({
      country: body.country,
      vehicleType: body.vehicleType,
      vignetteType: body.vignetteType,
      vehicleCountry: body.vehicleCountry.toUpperCase(),
      plateNumber: body.plateNumber.toUpperCase(),
      validityStartDate: new Date(body.validityStartDate),
      validityStartTime: body.validityStartTime,
      status: 'pending',
    });

    const queue = getCheckPeriodQueue();
    await queue.add(
      'check-period',
      { checkId: check._id.toString(), ...body },
      { attempts: 2, backoff: { type: 'fixed', delay: 3000 } }
    );

    return reply.status(202).send({
      id: check._id,
      status: 'pending',
      estimatedCompletionSeconds: 15,
    });
  });

  // Get a period-check result
  app.get('/api/v1/check-period/:id', {
    schema: {
      tags: ['verification'],
      summary: 'Get a period-check result',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
            plateNumber: { type: 'string' },
            vehicleCountry: { type: 'string' },
            result: {
              type: 'object',
              nullable: true,
              properties: {
                purchasable: { type: 'boolean' },
                isOverlapping: { type: 'boolean' },
                hasExactMatching: { type: 'boolean' },
                isCloseToEndDay: { type: 'boolean' },
                message: { type: 'string', nullable: true },
                overlappingVignettes: { type: 'array', items: overlappingVignetteSchema },
              },
            },
            error: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const check = await PeriodCheck.findById(id);
    if (!check) {
      return reply.status(404).send({ error: 'Period check not found' });
    }

    return {
      id: check._id,
      status: check.status,
      plateNumber: check.plateNumber,
      vehicleCountry: check.vehicleCountry,
      result: check.status === 'completed'
        ? {
            purchasable: check.purchasable ?? false,
            isOverlapping: check.isOverlapping ?? false,
            hasExactMatching: check.hasExactMatching ?? false,
            isCloseToEndDay: check.isCloseToEndDay ?? false,
            message: check.message,
            overlappingVignettes: check.overlappingVignettes ?? [],
          }
        : undefined,
      error: check.error,
      createdAt: check.createdAt,
    };
  });
}
