import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role, User } from '@prisma/client';
import { COOKIE_NAME, verifyToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

export type AuthedRequest = FastifyRequest & {
  user: User;
};

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[COOKIE_NAME];
  if (!token) {
    reply.code(401).send({ error: 'Не авторизован' });
    return;
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      reply.code(401).send({ error: 'Пользователь не найден' });
      return;
    }
    (request as AuthedRequest).user = user;
  } catch {
    reply.code(401).send({ error: 'Недействительный токен' });
  }
}

export function requireRoles(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthedRequest).user;
    if (!user || !roles.includes(user.role)) {
      reply.code(403).send({ error: 'Недостаточно прав' });
    }
  };
}

export function canWrite(role: Role): boolean {
  return role === 'ADMIN' || role === 'DEVELOPER';
}

export function canDeleteBoardOrProject(role: Role): boolean {
  return role === 'ADMIN';
}

export function canManageUsers(role: Role): boolean {
  return role === 'ADMIN';
}

export function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarColor: user.avatarColor,
    role: user.role,
    createdAt: user.createdAt,
  };
}
