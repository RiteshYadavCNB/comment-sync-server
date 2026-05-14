import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { assertAuthConfigured, config } from './config.js';
import { ensureSchema } from './db/migrate.js';
import { pool } from './db/pool.js';
import { startCleanupJob } from './jobs/cleanupResolvedComments.js';
import { createCommentsRouter } from './routes/comments.js';
import { errorHandler } from './utils/errors.js';
import { createSocketServer } from './websocket/socket.js';

const getCorsOrigin = () => (config.corsOrigins === '*' ? true : config.corsOrigins);

const app = express();
const httpServer = http.createServer(app);
const io = createSocketServer(httpServer);

app.use(
  cors({
    origin: getCorsOrigin(),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/comments', createCommentsRouter(io));
app.use(errorHandler);

const start = async () => {
  assertAuthConfigured();
  await ensureSchema();
  const cleanupJob = startCleanupJob(io);

  httpServer.listen(config.port, () => {
    console.log(`Comment server listening on port ${config.port}`);
  });

  const shutdown = async () => {
    cleanupJob.stop();
    io.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await pool.end();
  };

  process.on('SIGTERM', () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  });

  process.on('SIGINT', () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
