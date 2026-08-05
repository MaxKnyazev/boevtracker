import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { COOKIE_NAME, signToken } from '../lib/auth.js';
import {
  authenticate,
  canManageUsers,
  publicUser,
  requireRoles,
  type AuthedRequest,
} from '../lib/permissions.js';
import { pickAvatarColor } from '../lib/avatar.js';

const registerSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9_]+$/, 'Только латиница, цифры и _'),
    firstName: z.string().trim().min(1).max(64),
    lastName: z.string().trim().min(1).max(64),
    password: z.string().min(6).max(128),
    confirmPassword: z.string().min(6).max(128),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

function setAuthCookie(reply: { setCookie: Function }, token: string) {
  reply.setCookie(COOKIE_NAME, token, {
    ...cookieOpts,
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { username, password, firstName, lastName } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return reply.code(409).send({ error: 'Логин уже занят' });
    }

    const used = await prisma.user.findMany({ select: { avatarColor: true } });
    const avatarColor = await pickAvatarColor(used.map((u) => u.avatarColor));
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        firstName,
        lastName,
        avatarColor,
        passwordHash,
        role: 'PENDING',
      },
    });

    const token = signToken({ userId: user.id, role: user.role });
    setAuthCookie(reply, token);
    return reply.code(201).send({ user: publicUser(user) });
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Неверные данные' });
    }

    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Неверный логин или пароль' });
    }

    const token = signToken({ userId: user.id, role: user.role });
    setAuthCookie(reply, token);
    return { user: publicUser(user) };
  });

  app.post('/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, cookieOpts);
    return { ok: true };
  });

  app.get(
    '/me',
    { preHandler: [authenticate] },
    async (request) => {
      const user = (request as AuthedRequest).user;
      return { user: publicUser(user) };
    },
  );
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    { preHandler: [requireRoles('ADMIN')] },
    async () => {
      const users = await prisma.user.findMany({
        orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      });
      return { users: users.map(publicUser) };
    },
  );

  app.get(
    '/assignable',
    async (request, reply) => {
      const user = (request as AuthedRequest).user;
      if (user.role === 'PENDING' || user.role === 'READER') {
        // readers can see names for display; assignable list for writers
      }
      const users = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'DEVELOPER', 'READER'] } },
        orderBy: { username: 'asc' },
      });
      return { users: users.map(publicUser) };
    },
  );

  app.patch(
    '/:id/role',
    { preHandler: [requireRoles('ADMIN')] },
    async (request, reply) => {
      if (!canManageUsers((request as AuthedRequest).user.role)) {
        return reply.code(403).send({ error: 'Недостаточно прав' });
      }

      const schema = z.object({
        role: z.enum(['ADMIN', 'DEVELOPER', 'READER', 'PENDING']),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Неверная роль' });
      }

      const id = Number((request.params as { id: string }).id);
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }

      const me = (request as AuthedRequest).user;
      if (me.id === id && parsed.data.role !== 'ADMIN') {
        return reply
          .code(400)
          .send({ error: 'Нельзя снять с себя роль администратора' });
      }

      const user = await prisma.user.update({
        where: { id },
        data: { role: parsed.data.role },
      });
      return { user: publicUser(user) };
    },
  );

  app.post(
    '/:id/approve',
    { preHandler: [requireRoles('ADMIN')] },
    async (request, reply) => {
      const schema = z.object({
        role: z.enum(['ADMIN', 'DEVELOPER', 'READER']).default('DEVELOPER'),
      });
      const parsed = schema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Неверные данные' });
      }

      const id = Number((request.params as { id: string }).id);
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }
      if (target.role !== 'PENDING') {
        return reply.code(400).send({ error: 'Пользователь уже подтверждён' });
      }

      const user = await prisma.user.update({
        where: { id },
        data: { role: parsed.data.role },
      });
      return { user: publicUser(user) };
    },
  );

  app.post(
    '/:id/reject',
    { preHandler: [requireRoles('ADMIN')] },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }
      if (target.role !== 'PENDING') {
        return reply.code(400).send({ error: 'Можно отклонить только ожидающих' });
      }

      await prisma.user.delete({ where: { id } });
      return { ok: true };
    },
  );
}
