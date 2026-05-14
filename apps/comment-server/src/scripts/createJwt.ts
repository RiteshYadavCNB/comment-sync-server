import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { getJwtSecret } from '../config.js';

const [, , projectId, role = 'admin', expiresIn = '7d'] = process.argv;

if (!projectId) {
  console.error('Usage: npm run token -w apps/comment-server -- <projectId> [role] [expiresIn]');
  process.exit(1);
}

const token = jwt.sign(
  {
    projectId,
    role,
  },
  getJwtSecret(),
  {
    expiresIn: expiresIn as SignOptions['expiresIn'],
  },
);

console.log(token);
