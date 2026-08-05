import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  authenticate,
  canWrite,
  type AuthedRequest,
} from '../lib/permissions.js';
import { OPEN_STATUS_NAME } from '../lib/constants.js';
import { MAX_FILE_SIZE, getFileStream, uploadFile } from '../lib/s3.js';
import { userPublicSelect } from '../lib/avatar.js';

const taskInclude = {
  assignee: { select: userPublicSelect },
  status: true,
  files: true,
  createdBy: { select: userPublicSelect },
  project: {
    select: {
      id: true,
      name: true,
      boardId: true,
      board: { select: { id: true, name: true } },
    },
  },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: { select: userPublicSelect },
      files: true,
    },
  },
};

async function resolveOpenStatus(projectId: number, preferredName?: string) {
  if (preferredName) {
    const byName = await prisma.projectStatus.findFirst({
      where: { projectId, name: preferredName },
    });
    if (byName) return byName;
  }
  const open = await prisma.projectStatus.findFirst({
    where: { projectId, name: OPEN_STATUS_NAME },
  });
  if (open) return open;
  return prisma.projectStatus.findFirst({
    where: { projectId },
    orderBy: { order: 'asc' },
  });
}

export async function taskRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/tasks', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (user.role === 'PENDING') {
      return reply.code(403).send({ error: 'Ожидайте подтверждения' });
    }

    const tasks = await prisma.task.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: {
        assignee: { select: userPublicSelect },
        status: true,
        createdBy: { select: userPublicSelect },
        project: {
          select: {
            id: true,
            name: true,
            boardId: true,
            board: { select: { id: true, name: true } },
          },
        },
      },
    });

    return { tasks };
  });

  app.post('/projects/:projectId/tasks', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(10000).optional().nullable(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      deadline: z.string().datetime().optional().nullable(),
      statusId: z.number().int().optional(),
      assigneeId: z.number().int().optional().nullable(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const projectId = Number((request.params as { projectId: string }).projectId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { statuses: true },
    });
    if (!project) {
      return reply.code(404).send({ error: 'Проект не найден' });
    }

    let statusId = parsed.data.statusId;
    if (!statusId) {
      const open = await resolveOpenStatus(projectId);
      if (!open) {
        return reply.code(400).send({ error: 'У проекта нет статусов' });
      }
      statusId = open.id;
    } else if (!project.statuses.some((s) => s.id === statusId)) {
      return reply.code(400).send({ error: 'Статус не принадлежит проекту' });
    }

    const maxOrder = await prisma.task.aggregate({
      where: { statusId },
      _max: { order: true },
    });

    const task = await prisma.task.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority ?? 'MEDIUM',
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
        projectId,
        statusId,
        order: (maxOrder._max.order ?? -1) + 1,
        assigneeId: parsed.data.assigneeId ?? null,
        createdById: user.id,
        statusChangedAt: new Date(),
      },
      include: taskInclude,
    });
    return reply.code(201).send({ task });
  });

  app.get('/tasks/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (user.role === 'PENDING') {
      return reply.code(403).send({ error: 'Ожидайте подтверждения' });
    }

    const id = Number((request.params as { id: string }).id);
    const task = await prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });
    if (!task) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }
    return { task };
  });

  app.patch('/tasks/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(10000).optional().nullable(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      deadline: z.string().datetime().optional().nullable(),
      statusId: z.number().int().optional(),
      assigneeId: z.number().int().optional().nullable(),
      projectId: z.number().int().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.task.findUnique({
      where: { id },
      include: { status: true },
    });
    if (!existing) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
    if (parsed.data.deadline !== undefined) {
      data.deadline = parsed.data.deadline ? new Date(parsed.data.deadline) : null;
    }
    if (parsed.data.assigneeId !== undefined) data.assigneeId = parsed.data.assigneeId;

    let targetProjectId = existing.projectId;
    if (parsed.data.projectId !== undefined && parsed.data.projectId !== existing.projectId) {
      const targetProject = await prisma.project.findUnique({
        where: { id: parsed.data.projectId },
        include: { statuses: true },
      });
      if (!targetProject) {
        return reply.code(404).send({ error: 'Целевой проект не найден' });
      }
      targetProjectId = targetProject.id;
      data.projectId = targetProjectId;

      const mapped = await resolveOpenStatus(targetProjectId, existing.status.name);
      if (!mapped) {
        return reply.code(400).send({ error: 'У целевого проекта нет статусов' });
      }
      data.statusId = mapped.id;
      data.statusChangedAt = new Date();
    }

    if (parsed.data.statusId !== undefined) {
      const status = await prisma.projectStatus.findFirst({
        where: { id: parsed.data.statusId, projectId: targetProjectId },
      });
      if (!status) {
        return reply.code(400).send({ error: 'Статус не принадлежит проекту' });
      }
      if (status.id !== existing.statusId) {
        data.statusId = status.id;
        data.statusChangedAt = new Date();
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data,
      include: taskInclude,
    });
    return { task };
  });

  app.post('/tasks/:id/take', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }

    const task = await prisma.task.update({
      where: { id },
      data: { assigneeId: user.id },
      include: taskInclude,
    });
    return { task };
  });

  /** Reorder / move task within or across status columns */
  app.put('/tasks/:id/position', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({
      statusId: z.number().int(),
      index: z.number().int().min(0),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите statusId и index' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }

    const status = await prisma.projectStatus.findFirst({
      where: { id: parsed.data.statusId, projectId: existing.projectId },
    });
    if (!status) {
      return reply.code(400).send({ error: 'Статус не принадлежит проекту' });
    }

    const statusChanged = status.id !== existing.statusId;

    const siblings = await prisma.task.findMany({
      where: {
        statusId: status.id,
        id: { not: id },
      },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    const index = Math.min(parsed.data.index, siblings.length);
    const orderedIds = [
      ...siblings.slice(0, index).map((t) => t.id),
      id,
      ...siblings.slice(index).map((t) => t.id),
    ];

    await prisma.$transaction([
      prisma.task.update({
        where: { id },
        data: {
          statusId: status.id,
          order: index,
          ...(statusChanged ? { statusChangedAt: new Date() } : {}),
        },
      }),
      ...orderedIds.map((taskId, order) =>
        prisma.task.update({
          where: { id: taskId },
          data: { order },
        }),
      ),
    ]);

    const task = await prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });
    return { task };
  });

  app.post('/tasks/:id/move-board', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({
      boardId: z.number().int(),
      projectId: z.number().int(),
      statusId: z.number().int().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Укажите доску и проект' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.task.findUnique({
      where: { id },
      include: { status: true },
    });
    if (!existing) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }

    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, boardId: parsed.data.boardId },
      include: { statuses: true },
    });
    if (!project) {
      return reply.code(404).send({ error: 'Проект на указанной доске не найден' });
    }

    let statusId = parsed.data.statusId;
    if (statusId) {
      if (!project.statuses.some((s) => s.id === statusId)) {
        return reply.code(400).send({ error: 'Статус не принадлежит проекту' });
      }
    } else {
      const mapped = await resolveOpenStatus(project.id, existing.status.name);
      if (!mapped) {
        return reply.code(400).send({ error: 'У проекта нет статусов' });
      }
      statusId = mapped.id;
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        projectId: project.id,
        statusId,
        statusChangedAt: new Date(),
      },
      include: taskInclude,
    });
    return { task };
  });

  app.delete('/tasks/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }

    await prisma.task.delete({ where: { id } });
    return { ok: true };
  });

  app.post('/tasks/:id/comments', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const schema = z.object({ body: z.string().min(1).max(5000) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Комментарий не может быть пустым' });
    }

    const taskId = Number((request.params as { id: string }).id);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }

    const comment = await prisma.comment.create({
      data: {
        body: parsed.data.body,
        taskId,
        authorId: user.id,
      },
      include: {
        author: { select: userPublicSelect },
        files: true,
      },
    });
    return reply.code(201).send({ comment });
  });

  app.get('/attachments/:id', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (user.role === 'PENDING') {
      return reply.code(403).send({ error: 'Ожидайте подтверждения' });
    }

    const id = Number((request.params as { id: string }).id);
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) {
      return reply.code(404).send({ error: 'Файл не найден' });
    }

    try {
      const { body, contentType, contentLength } = await getFileStream(
        attachment.key,
      );
      const disposition = request.query &&
        typeof request.query === 'object' &&
        (request.query as { download?: string }).download === '1'
          ? 'attachment'
          : 'inline';
      const safeName = attachment.originalName.replace(/"/g, '');

      reply.header(
        'Content-Type',
        contentType || attachment.mimeType || 'application/octet-stream',
      );
      if (contentLength != null) {
        reply.header('Content-Length', contentLength);
      }
      reply.header(
        'Content-Disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      );
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(body);
    } catch {
      return reply.code(404).send({ error: 'Файл недоступен в хранилище' });
    }
  });

  app.post('/tasks/:id/files', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const taskId = Number((request.params as { id: string }).id);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }

    const attachments = [];
    for await (const file of request.files()) {
      const buffer = await file.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        return reply
          .code(400)
          .send({ error: `Файл «${file.filename}» больше 100 МБ` });
      }
      const uploaded = await uploadFile(buffer, file.filename, file.mimetype);
      const attachment = await prisma.attachment.create({
        data: {
          filename: uploaded.filename,
          originalName: file.filename,
          mimeType: file.mimetype,
          size: buffer.length,
          key: uploaded.key,
          url: uploaded.url,
          taskId,
        },
      });
      attachments.push(attachment);
    }

    if (!attachments.length) {
      return reply.code(400).send({ error: 'Файл не передан' });
    }
    return reply.code(201).send({ files: attachments, file: attachments[0] });
  });

  app.post('/comments/:id/files', async (request, reply) => {
    const user = (request as AuthedRequest).user;
    if (!canWrite(user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }

    const commentId = Number((request.params as { id: string }).id);
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      return reply.code(404).send({ error: 'Комментарий не найден' });
    }

    const attachments = [];
    for await (const file of request.files()) {
      const buffer = await file.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        return reply
          .code(400)
          .send({ error: `Файл «${file.filename}» больше 100 МБ` });
      }
      const uploaded = await uploadFile(buffer, file.filename, file.mimetype);
      const attachment = await prisma.attachment.create({
        data: {
          filename: uploaded.filename,
          originalName: file.filename,
          mimeType: file.mimetype,
          size: buffer.length,
          key: uploaded.key,
          url: uploaded.url,
          commentId,
        },
      });
      attachments.push(attachment);
    }

    if (!attachments.length) {
      return reply.code(400).send({ error: 'Файл не передан' });
    }
    return reply.code(201).send({ files: attachments, file: attachments[0] });
  });
}
