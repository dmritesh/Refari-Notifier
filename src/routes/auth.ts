import { FastifyInstance } from 'fastify';
import { HubstaffOAuthService } from '../services/hubstaff-oauth';
import prisma from '../db';

export default async function authRoutes(fastify: FastifyInstance) {
    // GET /auth/hubstaff?orgId=...
    fastify.get('/auth/hubstaff', async (request, reply) => {
        const { orgId } = request.query as { orgId: string };

        if (!orgId) {
            return reply.code(400).send({ error: 'orgId is required' });
        }

        // Check if org exists
        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        if (!org) {
            return reply.code(404).send({ error: 'Organization not found' });
        }

        // State can be used to pass orgId through the flow
        const state = orgId;
        const url = HubstaffOAuthService.getAuthorizationUrl(state);

        reply.redirect(url);
    });

    // GET /auth/hubstaff/callback?code=...&state=...
    fastify.get('/auth/hubstaff/callback', async (request, reply) => {
        const { code, state: orgId, error, error_description } = request.query as any;

        if (error) {
            request.log.error({ error, error_description }, 'Hubstaff Auth Callback Error');
            return reply.code(400).send({
                error: `Hubstaff Auth Error: ${error}`,
                description: error_description
            });
        }

        if (!code || !orgId) {
            return reply.code(400).send({ error: 'Missing code or state' });
        }

        try {
            await HubstaffOAuthService.exchangeCodeForToken(orgId, code);
            return { message: 'Hubstaff connected successfully! You can close this window.' };
        } catch (err) {
            request.log.error(err);
            reply.code(500).send({ error: 'Failed to exchange token' });
        }
    });
}
