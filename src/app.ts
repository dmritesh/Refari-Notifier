import fastify from 'fastify';
import cors from '@fastify/cors';

import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import { startWorker } from './worker';


import path from 'path';
import fastifyStatic from '@fastify/static';

const server = fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport: {
            target: 'pino-pretty'
        }
    }
});

server.register(cors);
server.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/',
});

// Routes
server.register(healthRoutes);
server.register(adminRoutes);
server.register(authRoutes);

// Security: Basic Authentication Middleware
server.addHook('onRequest', async (request, reply) => {
    // Public routes (Health checks, OAuth callbacks, static files)
    if (
        request.url.startsWith('/health') ||
        request.url.startsWith('/auth') ||
        request.url.endsWith('.js') ||
        request.url.endsWith('.css') ||
        request.url.endsWith('.png') ||
        request.url.endsWith('.jpg') ||
        request.url.endsWith('.svg') ||
        request.url.endsWith('.ico')
    ) {
        return;
    }

    // Check for Basic Auth header
    const authHeader = request.headers['authorization'];

    // Default credentials
    const adminUser = 'admin';
    const adminPass = process.env.ADMIN_PASSWORD;

    if (!adminPass) {
        // If no password set, warn but allow (or block? safer to block, but might break dev)
        // For security requested by user, we should BLOCK if not set, 
        // but to avoid locking them out immediately if they haven't set .env, we'll log warning.
        // Actually, user asked "Ensure app is secured". We must enforce it.
        // If dev, maybe allow default? No, let's enforce.
        if (process.env.NODE_ENV === 'development') return; // Allow dev without pass

        server.log.error('ADMIN_PASSWORD is not set! Blocking access.');
        reply.code(500).send({ error: 'Server misconfiguration: ADMIN_PASSWORD not set' });
        return;
    }

    if (!authHeader) {
        reply.header('WWW-Authenticate', 'Basic realm="Refari Admin"');
        reply.code(401).send({ error: 'Unauthorized' });
        return;
    }

    const [scheme, credentials] = authHeader.split(' ');
    if (scheme !== 'Basic' || !credentials) {
        reply.code(400).send({ error: 'Invalid Authorization header' });
        return;
    }

    // Decode credentials
    const decoded = Buffer.from(credentials, 'base64').toString('utf-8');
    const [user, pass] = decoded.split(':');

    if (user !== adminUser || pass !== adminPass) {
        reply.header('WWW-Authenticate', 'Basic realm="Refari Admin"');
        reply.code(401).send({ error: 'Invalid credentials' });
        return;
    }
});


// Start server
const start = async () => {
    try {
        const port = parseInt(process.env.PORT || '3000', 10);
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening on port ${port}`);

        // Start background worker
        startWorker();

    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
