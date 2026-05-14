import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const unauthorized = (message = 'Unauthorized') =>
  new AppError(401, 'unauthorized', message);

export const invalidRoom = (message = 'Invalid room') =>
  new AppError(400, 'invalid_room', message);

export const missingComponentId = (message = 'Missing componentId') =>
  new AppError(400, 'missing_component_id', message);

export const commentNotFound = (message = 'Comment not found') =>
  new AppError(404, 'comment_not_found', message);

export const restoreExpired = (message = 'Restore window expired') =>
  new AppError(409, 'restore_expired', message);

export const databaseFailure = (message = 'Database failure') =>
  new AppError(500, 'database_failure', message);

export const asyncHandler =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Invalid request payload',
        issues: error.issues,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Internal server error',
    },
  });
};
