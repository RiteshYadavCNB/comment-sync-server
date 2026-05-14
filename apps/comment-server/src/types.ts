export type CommentStatus = 'open' | 'resolved';

export interface Comment {
  id: string;
  projectId: string;
  componentId: string;
  surfaceType: string;
  surfaceId: string | null;
  environment: string;
  message: string;
  authorName: string;
  status: CommentStatus;
  resolvedAt: string | null;
  resolvedBy: string | null;
  deleteAfter: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentEvent {
  id: string;
  commentId: string;
  projectId: string;
  componentId: string;
  eventType: string;
  payload: unknown;
  actorName: string;
  createdAt: string;
}

export interface AuthContext {
  projectId?: string;
  role?: string;
  tokenType: 'project-token' | 'jwt';
}

export interface CommentCreateInput {
  projectId: string;
  componentId: string;
  surfaceType: string;
  surfaceId?: string | null;
  environment: string;
  message: string;
  authorName: string;
}

export interface CommentActionResult {
  comment: Comment;
  event: CommentEvent;
}

export interface DeletedComment {
  id: string;
  projectId: string;
  componentId: string;
}
