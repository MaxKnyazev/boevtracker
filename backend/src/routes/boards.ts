import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  authenticate,
  canDeleteBoardOrProject,
  canWrite,
  type AuthedRequest,
} from '../lib/permissions.js';
import { DEFAULT_STATUSES, OPEN_STATUS_NAME } from '../lib/constants.js';
import { userPublicSelect } from '../lib/avatar.js';

export async function boardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (user.role === 'PENDING') {
      return reply.code(403).send({ error: 'Ожидайте подтверждения' });
    }

    const boards = await prisma.board.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: userPublicSelect },
        _count: { select: { projects: true } },
      },
    });
    return { boards };
  });

  app.post('/', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({ name: z.string().min(1).max(255) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите название' });
    }

    const board = await prisma.board.create({
      data: { name: parsed.data.name, createdById: user.id },
      include: {
        createdBy: { select: userPublicSelect },
        _count: { select: { projects: true } },
      },
    });
    return reply.code(201).send({ board });
  });

  app.get('/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (user.role === 'PENDING') {
      return reply.code(403).send({ error: 'Ожидайте подтверждения' });
    }

    const id = Number((request.params as { id: string }).id);
    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        createdBy: { select: userPublicSelect },
        projects: {
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          include: {
            _count: { select: { tasks: true } },
            statuses: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!board) {
      return reply.code(404).send({ error: 'Доска не найдена' });
    }
    return { board };
  });

  app.patch('/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({ name: z.string().min(1).max(255) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите название' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.board.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Доска не найдена' });
    }

    const board = await prisma.board.update({
      where: { id },
      data: { name: parsed.data.name },
      include: {
        createdBy: { select: userPublicSelect },
        _count: { select: { projects: true } },
      },
    });
    return { board };
  });

  app.delete('/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canDeleteBoardOrProject(user.role)) {
      return reply.code(403).send({ error: 'Только администратор может удалять доски' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.board.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Доска не найдена' });
    }

    await prisma.board.delete({ where: { id } });
    return { ok: true };
  });
}

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.post('/boards/:boardId/projects', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({ name: z.string().min(1).max(255) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите название' });
    }

    const boardId = Number((request.params as { boardId: string }).boardId);
    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) {
      return reply.code(404).send({ error: 'Доска не найдена' });
    }

    const maxOrder = await prisma.project.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const project = await prisma.project.create({
      data: {
        name: parsed.data.name,
        boardId,
        createdById: user.id,
        order: (maxOrder._max.order ?? -1) + 1,
        statuses: {
          create: DEFAULT_STATUSES.map((name, order) => ({ name, order })),
        },
      },
      include: {
        statuses: { orderBy: { order: 'asc' } },
        _count: { select: { tasks: true } },
      },
    });
    return reply.code(201).send({ project });
  });

  app.put('/boards/:boardId/projects/reorder', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({
      orderedIds: z.array(z.number().int()).min(1),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите порядок проектов' });
    }

    const boardId = Number((request.params as { boardId: string }).boardId);
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: { projects: { select: { id: true } } },
    });
    if (!board) {
      return reply.code(404).send({ error: 'Доска не найдена' });
    }

    const existingIds = new Set(board.projects.map((p) => p.id));
    if (
      parsed.data.orderedIds.length !== existingIds.size ||
      parsed.data.orderedIds.some((id) => !existingIds.has(id))
    ) {
      return reply.code(400).send({ error: 'Некорректный список проектов' });
    }

    await prisma.$transaction(
      parsed.data.orderedIds.map((projectId, order) =>
        prisma.project.update({
          where: { id: projectId },
          data: { order },
        }),
      ),
    );

    const projects = await prisma.project.findMany({
      where: { boardId },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      include: {
        _count: { select: { tasks: true } },
        statuses: { orderBy: { order: 'asc' } },
      },
    });
    return { projects };
  });

  app.get('/projects/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (user.role === 'PENDING') {
      return reply.code(403).send({ error: 'Ожидайте подтверждения' });
    }

    const id = Number((request.params as { id: string }).id);
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        board: true,
        statuses: { orderBy: { order: 'asc' } },
        tasks: {
          include: {
            assignee: { select: userPublicSelect },
            status: true,
            files: true,
            _count: { select: { comments: true } },
          },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!project) {
      return reply.code(404).send({ error: 'Проект не найден' });
    }
    return { project };
  });

  app.patch('/projects/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({ name: z.string().min(1).max(255) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите название' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Проект не найден' });
    }

    const project = await prisma.project.update({
      where: { id },
      data: { name: parsed.data.name },
      include: {
        statuses: { orderBy: { order: 'asc' } },
        _count: { select: { tasks: true } },
      },
    });
    return { project };
  });

  app.delete('/projects/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canDeleteBoardOrProject(user.role)) {
      return reply
        .code(403)
        .send({ error: 'Только администратор может удалять проекты' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Проект не найден' });
    }

    await prisma.project.delete({ where: { id } });
    return { ok: true };
  });

  // Statuses
  app.post('/projects/:id/statuses', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({ name: z.string().min(1).max(128) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите название статуса' });
    }

    const projectId = Number((request.params as { id: string }).id);
    const max = await prisma.projectStatus.aggregate({
      where: { projectId },
      _max: { order: true },
    });

    try {
      const status = await prisma.projectStatus.create({
        data: {
          projectId,
          name: parsed.data.name,
          order: (max._max.order ?? -1) + 1,
        },
      });
      return reply.code(201).send({ status });
    } catch {
      return reply.code(409).send({ error: 'Статус с таким именем уже есть' });
    }
  });

  app.patch('/statuses/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({
      name: z.string().min(1).max(128).optional(),
      order: z.number().int().min(0).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Неверные данные' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.projectStatus.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Статус не найден' });
    }

    try {
      const status = await prisma.projectStatus.update({
        where: { id },
        data: parsed.data,
      });
      return { status };
    } catch {
      return reply.code(409).send({ error: 'Статус с таким именем уже есть' });
    }
  });

  app.put('/projects/:id/statuses/reorder', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({
      orderedIds: z.array(z.number().int()).min(1),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Неверные данные' });
    }

    const projectId = Number((request.params as { id: string }).id);
    await prisma.$transaction(
      parsed.data.orderedIds.map((statusId, order) =>
        prisma.projectStatus.updateMany({
          where: { id: statusId, projectId },
          data: { order },
        }),
      ),
    );

    const statuses = await prisma.projectStatus.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
    return { statuses };
  });

  app.delete('/statuses/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.projectStatus.findUnique({
      where: { id },
      include: { _count: { select: { tasks: true } }, project: { include: { statuses: true } } },
    });
    if (!existing) {
      return reply.code(404).send({ error: 'Статус не найден' });
    }
    if (existing._count.tasks > 0) {
      return reply
        .code(400)
        .send({ error: 'Нельзя удалить статус с задачами. Сначала перенесите задачи.' });
    }
    if (existing.project.statuses.length <= 1) {
      return reply.code(400).send({ error: 'Должен остаться хотя бы один статус' });
    }

    await prisma.projectStatus.delete({ where: { id } });
    return { ok: true };
  });
}

export { OPEN_STATUS_NAME };
