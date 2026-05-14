import dotenv from 'dotenv';

dotenv.config();

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return 4000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
};

const parseCorsOrigins = (value: string | undefined): string[] | '*' => {
  if (!value || value.trim() === '' || value.trim() === '*') {
    return '*';
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const config = {
  port: parsePort(process.env.PORT),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/comment_sync',
  projectToken: process.env.PROJECT_TOKEN,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
};

export const getJwtSecret = (): string => {
  if (!config.jwtSecret || config.jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET is required');
  }

  return config.jwtSecret;
};

export const assertAuthConfigured = (): void => {
  if (config.projectToken || config.jwtSecret) {
    return;
  }

  throw new Error('Either PROJECT_TOKEN or JWT_SECRET is required');
};
