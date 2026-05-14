import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { config, getJwtSecret } from '../config.js';
import type { AuthContext } from '../types.js';
import { unauthorized } from '../utils/errors.js';

const extractBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
};

const isJwtPayload = (payload: string | JwtPayload): payload is JwtPayload =>
  typeof payload !== 'string';

export const authenticateToken = (token: unknown): AuthContext => {
  if (typeof token !== 'string' || token.trim() === '') {
    throw unauthorized();
  }

  if (config.projectToken && token === config.projectToken) {
    return {
      tokenType: 'project-token',
    };
  }

  if (!config.jwtSecret) {
    throw unauthorized('Invalid project token');
  }

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch {
    throw unauthorized('Invalid or expired JWT');
  }

  if (!isJwtPayload(payload) || typeof payload.projectId !== 'string') {
    throw unauthorized('Invalid JWT payload');
  }

  return {
    projectId: payload.projectId,
    role: typeof payload.role === 'string' ? payload.role : undefined,
    tokenType: 'jwt',
  };
};

export const assertProjectAccess = (auth: AuthContext, projectId: string): void => {
  if (auth.projectId && auth.projectId !== projectId) {
    throw unauthorized('Token is not authorized for this project');
  }
};

export const authMiddleware: RequestHandler = (req, res, next) => {
  try {
    const token =
      extractBearerToken(req.header('authorization')) ??
      req.header('x-project-token') ??
      req.query.token;

    res.locals.auth = authenticateToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

export const getRequestAuth = (resLocals: Record<string, unknown>): AuthContext => {
  const auth = resLocals.auth;
  if (!auth) {
    throw unauthorized();
  }

  return auth as AuthContext;
};
