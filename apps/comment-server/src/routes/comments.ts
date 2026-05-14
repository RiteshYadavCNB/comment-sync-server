import { Router } from 'express';
import type { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { assertProjectAccess, authMiddleware, getRequestAuth } from '../services/auth.js';
import {
  createComment,
  getCommentsForComponent,
  resolveComment,
  restoreCommentById,
} from '../services/commentsService.js';
import { asyncHandler } from '../utils/errors.js';
import { getCommentRoomId } from '../websocket/rooms.js';

const commentsQuerySchema = z.object({
  projectId: z.string().min(1),
  componentId: z.string().min(1),
});

const createCommentSchema = z.object({
  projectId: z.string().min(1),
  componentId: z.string().min(1),
  surfaceType: z.string().min(1),
  surfaceId: z.string().min(1).nullable().optional(),
  environment: z.string().min(1),
  message: z.string().min(1),
  authorName: z.string().min(1),
});

const actionBodySchema = z.object({
  actorName: z.string().min(1).optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const emitToCommentRoom = (
  io: SocketServer,
  eventName: 'comment:created' | 'comment:resolved' | 'comment:restored',
  result: {
    comment: {
      projectId: string;
      componentId: string;
    };
    event: unknown;
  },
) => {
  const roomId = getCommentRoomId(result.comment.projectId, result.comment.componentId);
  io.to(roomId).emit(eventName, result);
};

export const createCommentsRouter = (io: SocketServer): Router => {
  const router = Router();

  router.use(authMiddleware);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const auth = getRequestAuth(res.locals);
      const query = commentsQuerySchema.parse(req.query);
      assertProjectAccess(auth, query.projectId);

      const comments = await getCommentsForComponent(query.projectId, query.componentId);
      res.json({ comments });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const auth = getRequestAuth(res.locals);
      const input = createCommentSchema.parse(req.body);
      assertProjectAccess(auth, input.projectId);

      const result = await createComment(input);
      emitToCommentRoom(io, 'comment:created', result);

      res.status(201).json(result);
    }),
  );

  router.patch(
    '/:id/resolve',
    asyncHandler(async (req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      const { actorName = 'unknown' } = actionBodySchema.parse(req.body ?? {});
      const auth = getRequestAuth(res.locals);

      const result = await resolveComment(id, actorName, auth.projectId);

      emitToCommentRoom(io, 'comment:resolved', result);
      res.json(result);
    }),
  );

  router.patch(
    '/:id/restore',
    asyncHandler(async (req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      const { actorName = 'unknown' } = actionBodySchema.parse(req.body ?? {});
      const auth = getRequestAuth(res.locals);

      const result = await restoreCommentById(id, actorName, auth.projectId);

      emitToCommentRoom(io, 'comment:restored', result);
      res.json(result);
    }),
  );

  return router;
};
