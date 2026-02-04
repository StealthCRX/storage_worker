import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import filesRoutes from './routes/files';
import uploadRoutes from './routes/upload';
import downloadRoutes from './routes/download';

type Env = {
  Bindings: {
    R2_BUCKET: R2Bucket;
    KV: KVNamespace;
    ACCESS_CODE: string;
    JWT_SECRET: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_ACCOUNT_ID: string;
    R2_BUCKET_NAME: string;
    ALLOWED_ORIGIN: string;
    CHUNK_SIZE: string;
  };
  Variables: {
    user: string;
  };
};

const app = new Hono<Env>();

// CORS on all routes
app.use('*', corsMiddleware);

// Public routes
app.route('/api/auth', authRoutes);

// Protected routes — auth middleware on specific prefixes to avoid hitting /api/auth
app.use('/api/files/*', authMiddleware);
app.use('/api/files', authMiddleware);
app.use('/api/upload/*', authMiddleware);
app.use('/api/download/*', authMiddleware);
app.route('/api/files', filesRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/download', downloadRoutes);

// Health check
app.get('/', (c) => c.json({ status: 'ok' }));

export default app;
