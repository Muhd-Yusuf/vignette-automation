import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Verification } from '@vignette/database';
import { getVerificationQueue } from '../services/queueService';

const verifySchema = z.object({
  country: z.string().default('bulgaria'),
  vehicleCountry: z.string().min(2).max(3),
  plateNumber: z.string().min(1).max(20),
  status: z.enum(['active', 'expired', 'unused']).optional(),
});

const vignetteRecordSchema = {
  type: 'object',
  properties: {
    idNumber: { type: 'string', example: '26060562638274' },
    vehicleClass: { type: 'string', example: 'Light Vehicle <= 3.5 t' },
    emissionClass: { type: 'string' },
    numberOfAxles: { type: 'string' },
    co2Class: { type: 'string' },
    validFrom: { type: 'string', format: 'date-time', nullable: true },
    validTo: { type: 'string', format: 'date-time', nullable: true },
    amount: { type: 'string', example: '49,60 € (97,00 лв.)' },
    priceEUR: { type: 'number', nullable: true },
    priceBGN: { type: 'number', nullable: true },
    status: { type: 'string', enum: ['active', 'expired', 'unused', 'unknown'] },
    statusLabel: { type: 'string', example: 'Active' },
  },
};

export async function verificationRoutes(app: FastifyInstance) {
  // Initiate verification
  app.post('/api/v1/verify', {
    schema: {
      tags: ['verification'],
      summary: 'Start a vignette verification',
      description:
        'Queues a verification for the given plate. Returns immediately with an id; ' +
        'poll GET /api/v1/verify/{id} until status is "completed" or "failed".',
      body: {
        type: 'object',
        required: ['vehicleCountry', 'plateNumber'],
        properties: {
          country: { type: 'string', default: 'bulgaria' },
          vehicleCountry: { type: 'string', minLength: 2, maxLength: 3, description: 'ISO country code, e.g. BG' },
          plateNumber: { type: 'string', minLength: 1, maxLength: 20, description: 'License plate, e.g. CB9456KE' },
          status: { type: 'string', enum: ['active', 'expired', 'unused'] },
        },
      },
      response: {
        202: {
          description: 'Verification queued',
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', example: 'pending' },
            estimatedCompletionSeconds: { type: 'integer', example: 30 },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = verifySchema.parse(request.body);

    const verification = await Verification.create({
      country: body.country,
      vehicleCountry: body.vehicleCountry.toUpperCase(),
      plateNumber: body.plateNumber.toUpperCase(),
      status: 'pending',
    });

    const queue = getVerificationQueue();
    await queue.add(
      'verify-vignette',
      {
        verificationId: verification._id.toString(),
        ...body,
      },
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
      }
    );

    return reply.status(202).send({
      id: verification._id,
      status: 'pending',
      estimatedCompletionSeconds: 30,
    });
  });

  // Get verification result
  app.get('/api/v1/verify/:id', {
    schema: {
      tags: ['verification'],
      summary: 'Get a verification result',
      description:
        'Returns the verification status and, once completed, the full list of ' +
        'vignettes found for the plate (all statuses) plus an overall isActive flag.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
            vehicleCountry: { type: 'string' },
            plateNumber: { type: 'string' },
            result: {
              type: 'object',
              nullable: true,
              properties: {
                found: { type: 'boolean' },
                isActive: { type: 'boolean' },
                vignettes: { type: 'array', items: vignetteRecordSchema },
                validFrom: { type: 'string', format: 'date-time', nullable: true },
                validTo: { type: 'string', format: 'date-time', nullable: true },
                idNumber: { type: 'string', nullable: true },
              },
            },
            error: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            finalizedAt: { type: 'string', format: 'date-time', nullable: true },
            durationMs: { type: 'integer', nullable: true, description: 'Wall-clock time to complete the verification' },
          },
        },
        404: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const verification = await Verification.findById(id);
    if (!verification) {
      return reply.status(404).send({ error: 'Verification not found' });
    }

    return {
      id: verification._id,
      status: verification.status,
      vehicleCountry: verification.vehicleCountry,
      plateNumber: verification.plateNumber,
      result: verification.status === 'completed'
        ? {
            found: (verification.vignettes?.length ?? 0) > 0 || verification.isActive !== undefined,
            isActive: verification.isActive ?? false,
            vignettes: verification.vignettes ?? [],
            // Backward-compatible single-record fields (point at the active vignette)
            validFrom: verification.validFrom?.toISOString(),
            validTo: verification.validTo?.toISOString(),
            idNumber: verification.productType,
          }
        : undefined,
      error: verification.error,
      createdAt: verification.createdAt,
      finalizedAt: verification.finalizedAt,
      durationMs: verification.finalizedAt
        ? verification.finalizedAt.getTime() - verification.createdAt.getTime()
        : undefined,
    };
  });
}
