import { FastifyInstance } from 'fastify';
import prisma from '../db';

export default async function healthRoutes(fastify: FastifyInstance) {
    fastify.get('/health', async (request, reply) => {
        try {
            // Simple DB check
            await prisma.$queryRaw`SELECT 1`;
            return { status: 'ok', database: 'connected' };
        } catch (error) {
            reply.code(503);
            return { status: 'error', database: 'disconnected', error: String(error) };
        }
    });
}
