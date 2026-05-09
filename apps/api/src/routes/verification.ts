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

export async function verificationRoutes(app: FastifyInstance) {
  // Initiate verification
  app.post('/api/v1/verify', async (request, reply) => {
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
  app.get('/api/v1/verify/:id', async (request, reply) => {
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
            found: verification.isActive !== undefined,
            isActive: verification.isActive,
            validFrom: verification.validFrom?.toISOString(),
            validTo: verification.validTo?.toISOString(),
            productType: verification.productType,
          }
        : undefined,
      error: verification.error,
      createdAt: verification.createdAt,
    };
  });
}
