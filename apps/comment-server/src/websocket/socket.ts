import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { z } from 'zod';
import { config } from '../config.js';
import { assertProjectAccess, authenticateToken } from '../services/auth.js';
import {
  createComment,
  getCommentsForComponent,
  getMissedEvents,
  resolveComment,
  restoreCommentById,
} from '../services/commentsService.js';
import type { AuthContext } from '../types.js';
import { AppError } from '../utils/errors.js';
import { getCommentRoomId } from './rooms.js';

type Ack = (payload: unknown) => void;

interface AuthedSocket extends Socket {
  data: {
    auth: AuthContext;
  };
}

const roomSchema = z.object({
  projectId: z.string().min(1),
  componentId: z.string().min(1),
});

const createSocketCommentSchema = z.object({
  projectId: z.string().min(1),
  componentId: z.string().min(1),
  surfaceType: z.string().min(1),
  surfaceId: z.string().min(1).nullable().optional(),
  environment: z.string().min(1),
  message: z.string().min(1),
  authorName: z.string().min(1),
});

const actionSchema = z.object({
  id: z.string().uuid(),
  actorName: z.string().min(1).optional(),
});

const syncSchema = z.object({
  projectId: z.string().min(1),
  componentId: z.string().min(1),
  lastSeenEventId: z.string().uuid().nullable().optional(),
});

const getCorsOrigin = () => (config.corsOrigins === '*' ? true : config.corsOrigins);

const toSocketError = (error: unknown) => {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      code: 'validation_error',
      message: 'Invalid socket payload',
      issues: error.issues,
    };
  }

  console.error(error);
  return {
    code: 'internal_error',
    message: 'Internal server error',
  };
};

const runSocketHandler =
  (socket: AuthedSocket, ack: Ack | undefined, handler: () => Promise<unknown>) => async () => {
    try {
      const result = await handler();
      ack?.({ ok: true, ...((result as object | null) ?? {}) });
    } catch (error) {
      const socketError = toSocketError(error);
      ack?.({ ok: false, error: socketError });
      if (!ack) {
        socket.emit('comment:error', socketError);
      }
    }
  };

export const createSocketServer = (httpServer: HttpServer): SocketServer => {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: getCorsOrigin(),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      socket.data.auth = authenticateToken(token);
      next();
    } catch (error) {
      const socketError = toSocketError(error);
      const connectError = new Error(socketError.message);
      Object.assign(connectError, { data: socketError });
      next(connectError);
    }
  });

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthedSocket;

    socket.on('comment:subscribe', (payload: unknown, ack?: Ack) => {
      void runSocketHandler(socket, ack, async () => {
        const room = roomSchema.parse(payload);
        assertProjectAccess(socket.data.auth, room.projectId);

        const roomId = getCommentRoomId(room.projectId, room.componentId);
        await socket.join(roomId);

        const comments = await getCommentsForComponent(room.projectId, room.componentId);
        socket.emit('comments:initial', {
          projectId: room.projectId,
          componentId: room.componentId,
          comments,
        });

        return { roomId, comments };
      })();
    });

    socket.on('comment:create', (payload: unknown, ack?: Ack) => {
      void runSocketHandler(socket, ack, async () => {
        const input = createSocketCommentSchema.parse(payload);
        assertProjectAccess(socket.data.auth, input.projectId);

        const result = await createComment(input);
        const roomId = getCommentRoomId(result.comment.projectId, result.comment.componentId);
        io.to(roomId).emit('comment:created', result);

        return result;
      })();
    });

    socket.on('comment:resolve', (payload: unknown, ack?: Ack) => {
      void runSocketHandler(socket, ack, async () => {
        const input = actionSchema.parse(payload);
        const result = await resolveComment(
          input.id,
          input.actorName ?? 'unknown',
          socket.data.auth.projectId,
        );

        const roomId = getCommentRoomId(result.comment.projectId, result.comment.componentId);
        io.to(roomId).emit('comment:resolved', result);

        return result;
      })();
    });

    socket.on('comment:restore', (payload: unknown, ack?: Ack) => {
      void runSocketHandler(socket, ack, async () => {
        const input = actionSchema.parse(payload);
        const result = await restoreCommentById(
          input.id,
          input.actorName ?? 'unknown',
          socket.data.auth.projectId,
        );

        const roomId = getCommentRoomId(result.comment.projectId, result.comment.componentId);
        io.to(roomId).emit('comment:restored', result);

        return result;
      })();
    });

    socket.on('comments:sync', (payload: unknown, ack?: Ack) => {
      void runSocketHandler(socket, ack, async () => {
        const input = syncSchema.parse(payload);
        assertProjectAccess(socket.data.auth, input.projectId);

        const events = await getMissedEvents(
          input.projectId,
          input.componentId,
          input.lastSeenEventId ?? null,
        );

        return { events };
      })();
    });
  });

  return io;
};
