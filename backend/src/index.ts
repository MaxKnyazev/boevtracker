import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { authRoutes, userRoutes } from './routes/auth.js';
import { boardRoutes, projectRoutes } from './routes/boards.js';
import { taskRoutes } from './routes/tasks.js';
import { MAX_FILE_SIZE } from './lib/s3.js';

const PORT = Number(process.env.PORT || 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

async function main() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'cookie-secret',
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_SIZE, files: 20 },
  });

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(boardRoutes, { prefix: '/api/boards' });
  await app.register(projectRoutes, { prefix: '/api' });
  await app.register(taskRoutes, { prefix: '/api' });

  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
