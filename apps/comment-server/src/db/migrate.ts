import { pool } from './pool.js';
import { schemaSql } from './schema.js';

export const ensureSchema = async (): Promise<void> => {
  await pool.query(schemaSql);
};

