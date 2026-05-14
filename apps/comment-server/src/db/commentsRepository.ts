import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type {
  Comment,
  CommentCreateInput,
  CommentEvent,
  CommentStatus,
  DeletedComment,
} from '../types.js';

type DbExecutor = Pool | PoolClient;

interface CommentRow extends QueryResultRow {
  id: string;
  project_id: string;
  component_id: string;
  surface_type: string;
  surface_id: string | null;
  environment: string;
  message: string;
  author_name: string;
  status: CommentStatus;
  resolved_at: Date | null;
  resolved_by: string | null;
  delete_after: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CommentEventRow extends QueryResultRow {
  id: string;
  comment_id: string;
  project_id: string;
  component_id: string;
  event_type: string;
  payload: unknown;
  actor_name: string;
  created_at: Date;
}

interface DeletedCommentRow extends QueryResultRow {
  id: string;
  project_id: string;
  component_id: string;
}

const toIso = (value: Date | null): string | null => {
  if (!value) {
    return null;
  }

  return value.toISOString();
};

const firstRow = <T extends QueryResultRow>(result: QueryResult<T>): T | null =>
  result.rows[0] ?? null;

const mapComment = (row: CommentRow): Comment => ({
  id: row.id,
  projectId: row.project_id,
  componentId: row.component_id,
  surfaceType: row.surface_type,
  surfaceId: row.surface_id,
  environment: row.environment,
  message: row.message,
  authorName: row.author_name,
  status: row.status,
  resolvedAt: toIso(row.resolved_at),
  resolvedBy: row.resolved_by,
  deleteAfter: toIso(row.delete_after),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const mapEvent = (row: CommentEventRow): CommentEvent => ({
  id: row.id,
  commentId: row.comment_id,
  projectId: row.project_id,
  componentId: row.component_id,
  eventType: row.event_type,
  payload: row.payload,
  actorName: row.actor_name,
  createdAt: row.created_at.toISOString(),
});

export const listComments = async (
  db: DbExecutor,
  projectId: string,
  componentId: string,
): Promise<Comment[]> => {
  const result = await db.query<CommentRow>(
    `
      SELECT *
      FROM comments
      WHERE project_id = $1
        AND component_id = $2
      ORDER BY created_at ASC
    `,
    [projectId, componentId],
  );

  return result.rows.map(mapComment);
};

export const findCommentById = async (
  db: DbExecutor,
  id: string,
): Promise<Comment | null> => {
  const result = await db.query<CommentRow>(
    `
      SELECT *
      FROM comments
      WHERE id = $1
    `,
    [id],
  );

  const row = firstRow(result);
  return row ? mapComment(row) : null;
};

export const insertComment = async (
  db: DbExecutor,
  input: CommentCreateInput,
): Promise<Comment> => {
  const result = await db.query<CommentRow>(
    `
      INSERT INTO comments (
        project_id,
        component_id,
        surface_type,
        surface_id,
        environment,
        message,
        author_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      input.projectId,
      input.componentId,
      input.surfaceType,
      input.surfaceId ?? null,
      input.environment,
      input.message,
      input.authorName,
    ],
  );

  const row = firstRow(result);
  if (!row) {
    throw new Error('Failed to insert comment');
  }

  return mapComment(row);
};

export const markCommentResolved = async (
  db: DbExecutor,
  id: string,
  actorName: string,
): Promise<Comment | null> => {
  const result = await db.query<CommentRow>(
    `
      UPDATE comments
      SET status = 'resolved',
          resolved_at = NOW(),
          resolved_by = $2,
          delete_after = NOW() + INTERVAL '24 hours'
      WHERE id = $1
      RETURNING *
    `,
    [id, actorName],
  );

  const row = firstRow(result);
  return row ? mapComment(row) : null;
};

export const markCommentOpen = async (
  db: DbExecutor,
  id: string,
): Promise<Comment | null> => {
  const result = await db.query<CommentRow>(
    `
      UPDATE comments
      SET status = 'open',
          resolved_at = NULL,
          resolved_by = NULL,
          delete_after = NULL
      WHERE id = $1
      RETURNING *
    `,
    [id],
  );

  const row = firstRow(result);
  return row ? mapComment(row) : null;
};

export const insertCommentEvent = async (
  db: DbExecutor,
  input: {
    commentId: string;
    projectId: string;
    componentId: string;
    eventType: string;
    payload: unknown;
    actorName: string;
  },
): Promise<CommentEvent> => {
  const result = await db.query<CommentEventRow>(
    `
      INSERT INTO comment_events (
        comment_id,
        project_id,
        component_id,
        event_type,
        payload,
        actor_name,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp())
      RETURNING *
    `,
    [
      input.commentId,
      input.projectId,
      input.componentId,
      input.eventType,
      JSON.stringify(input.payload),
      input.actorName,
    ],
  );

  const row = firstRow(result);
  if (!row) {
    throw new Error('Failed to insert comment event');
  }

  return mapEvent(row);
};

export const findEventById = async (
  db: DbExecutor,
  id: string,
): Promise<CommentEvent | null> => {
  const result = await db.query<CommentEventRow>(
    `
      SELECT *
      FROM comment_events
      WHERE id = $1
    `,
    [id],
  );

  const row = firstRow(result);
  return row ? mapEvent(row) : null;
};

export const listEventsAfter = async (
  db: DbExecutor,
  projectId: string,
  componentId: string,
  lastSeenEventId: string | null,
): Promise<CommentEvent[]> => {
  if (!lastSeenEventId) {
    const result = await db.query<CommentEventRow>(
      `
        SELECT *
        FROM comment_events
        WHERE project_id = $1
          AND component_id = $2
        ORDER BY created_at ASC, id ASC
        LIMIT 100
      `,
      [projectId, componentId],
    );

    return result.rows.map(mapEvent);
  }

  const result = await db.query<CommentEventRow>(
    `
      SELECT e.*
      FROM comment_events e
      JOIN comment_events cursor_event ON cursor_event.id = $3
      WHERE e.project_id = $1
        AND e.component_id = $2
        AND (
          e.created_at > cursor_event.created_at
          OR (e.created_at = cursor_event.created_at AND e.id > cursor_event.id)
        )
      ORDER BY e.created_at ASC, e.id ASC
      LIMIT 100
    `,
    [projectId, componentId, lastSeenEventId],
  );

  return result.rows.map(mapEvent);
};

export const deleteExpiredResolvedComments = async (
  db: DbExecutor,
): Promise<DeletedComment[]> => {
  const result = await db.query<DeletedCommentRow>(
    `
      DELETE FROM comments
      WHERE status = 'resolved'
        AND delete_after <= NOW()
      RETURNING id, project_id, component_id
    `,
  );

  return result.rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    componentId: row.component_id,
  }));
};
