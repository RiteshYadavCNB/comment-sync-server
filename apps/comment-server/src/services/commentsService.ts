import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import {
  deleteExpiredResolvedComments,
  findCommentById,
  findEventById,
  insertComment,
  insertCommentEvent,
  listComments,
  listEventsAfter,
  markCommentOpen,
  markCommentResolved,
} from '../db/commentsRepository.js';
import type {
  Comment,
  CommentActionResult,
  CommentCreateInput,
  CommentEvent,
  DeletedComment,
} from '../types.js';
import { commentNotFound, invalidRoom, restoreExpired, unauthorized } from '../utils/errors.js';

const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getCommentsForComponent = async (
  projectId: string,
  componentId: string,
): Promise<{ open: Comment[]; resolved: Comment[] }> => {
  const comments = await listComments(pool, projectId, componentId);

  return {
    open: comments.filter((comment) => comment.status === 'open'),
    resolved: comments.filter((comment) => comment.status === 'resolved'),
  };
};

export const createComment = async (
  input: CommentCreateInput,
): Promise<CommentActionResult> =>
  withTransaction(async (client) => {
    const comment = await insertComment(client, input);
    const event = await insertCommentEvent(client, {
      commentId: comment.id,
      projectId: comment.projectId,
      componentId: comment.componentId,
      eventType: 'comment:created',
      payload: { comment },
      actorName: comment.authorName,
    });

    return { comment, event };
  });

export const resolveComment = async (
  id: string,
  actorName: string,
  authorizedProjectId?: string,
): Promise<CommentActionResult> =>
  withTransaction(async (client) => {
    const current = await findCommentById(client, id);
    if (!current) {
      throw commentNotFound();
    }

    if (authorizedProjectId && current.projectId !== authorizedProjectId) {
      throw unauthorized('Token is not authorized for this project');
    }

    const comment = await markCommentResolved(client, id, actorName);
    if (!comment) {
      throw commentNotFound();
    }

    const event = await insertCommentEvent(client, {
      commentId: comment.id,
      projectId: comment.projectId,
      componentId: comment.componentId,
      eventType: 'comment:resolved',
      payload: { comment },
      actorName,
    });

    return { comment, event };
  });

export const restoreCommentById = async (
  id: string,
  actorName: string,
  authorizedProjectId?: string,
): Promise<CommentActionResult> =>
  withTransaction(async (client) => {
    const current = await findCommentById(client, id);
    if (!current) {
      throw commentNotFound();
    }

    if (authorizedProjectId && current.projectId !== authorizedProjectId) {
      throw unauthorized('Token is not authorized for this project');
    }

    if (
      current.status === 'resolved' &&
      current.deleteAfter &&
      new Date(current.deleteAfter).getTime() <= Date.now()
    ) {
      throw restoreExpired();
    }

    const comment = await markCommentOpen(client, id);
    if (!comment) {
      throw commentNotFound();
    }

    const event = await insertCommentEvent(client, {
      commentId: comment.id,
      projectId: comment.projectId,
      componentId: comment.componentId,
      eventType: 'comment:restored',
      payload: { comment },
      actorName,
    });

    return { comment, event };
  });

export const getMissedEvents = async (
  projectId: string,
  componentId: string,
  lastSeenEventId: string | null,
): Promise<CommentEvent[]> => {
  if (lastSeenEventId) {
    const cursor = await findEventById(pool, lastSeenEventId);
    if (!cursor) {
      throw invalidRoom('Unknown lastSeenEventId');
    }

    if (cursor.projectId !== projectId || cursor.componentId !== componentId) {
      throw invalidRoom('lastSeenEventId does not belong to this room');
    }
  }

  return listEventsAfter(pool, projectId, componentId, lastSeenEventId);
};

export const cleanupExpiredComments = async (): Promise<{
  deleted: DeletedComment[];
  events: CommentEvent[];
}> =>
  withTransaction(async (client) => {
    const deleted = await deleteExpiredResolvedComments(client);
    const events: CommentEvent[] = [];

    for (const comment of deleted) {
      const event = await insertCommentEvent(client, {
        commentId: comment.id,
        projectId: comment.projectId,
        componentId: comment.componentId,
        eventType: 'comment:deleted',
        payload: { id: comment.id },
        actorName: 'system',
      });

      events.push(event);
    }

    return { deleted, events };
  });
