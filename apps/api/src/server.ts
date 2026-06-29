import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { registerRoutes } from './http/routes.js';

const app = Fastify({
  logger: { level: process.env['LOG_LEVEL'] ?? 'info' },
});

await app.register(cors, {
  origin: process.env['CORS_ORIGIN'] ?? '*',
});

await app.register(helmet);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const status = (error as { statusCode?: number }).statusCode ?? 500;

  if (error.name === 'ConsentRequiredError') {
    return reply.status(403).send({ error: 'consent_required', message: error.message });
  }
  if (error.name === 'AssessmentNotFoundError') {
    return reply.status(404).send({ error: 'not_found', message: error.message });
  }
  if (error.name === 'AssessmentExpiredError') {
    return reply.status(410).send({ error: 'link_expired', message: error.message });
  }

  return reply.status(status).send({ error: 'internal_error', message: error.message });
});

await registerRoutes(app);

app.get('/health', async () => ({ ok: true }));

const port = Number(process.env['PORT'] ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
