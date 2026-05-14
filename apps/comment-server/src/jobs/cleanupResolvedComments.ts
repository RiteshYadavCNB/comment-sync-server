import cron from 'node-cron';
import type { Server as SocketServer } from 'socket.io';
import { cleanupExpiredComments } from '../services/commentsService.js';
import { getCommentRoomId } from '../websocket/rooms.js';

export const runCleanupOnce = async (io: SocketServer): Promise<void> => {
  const { deleted, events } = await cleanupExpiredComments();

  deleted.forEach((comment, index) => {
    const roomId = getCommentRoomId(comment.projectId, comment.componentId);
    io.to(roomId).emit('comment:deleted', {
      comment,
      event: events[index] ?? null,
    });
  });
};

export const startCleanupJob = (io: SocketServer) =>
  cron.schedule('*/10 * * * *', () => {
    runCleanupOnce(io).catch((error) => {
      console.error('Resolved comment cleanup failed', error);
    });
  });

