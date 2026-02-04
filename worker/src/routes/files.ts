import { Hono } from 'hono';
import { listFiles, getFile, deleteFile } from '../lib/kv';

type Env = {
  Bindings: {
    R2_BUCKET: R2Bucket;
    KV: KVNamespace;
  };
  Variables: {
    user: string;
  };
};

const files = new Hono<Env>();

files.get('/', async (c) => {
  const allFiles = await listFiles(c.env.KV);
  const completeFiles = allFiles.filter((f) => f.status === 'complete');

  // Verify each file still exists in R2, remove stale KV entries
  const verified = [];
  for (const file of completeFiles) {
    const obj = await c.env.R2_BUCKET.head(file.r2Key);
    if (obj) {
      verified.push(file);
    } else {
      // File deleted from R2, clean up KV
      await deleteFile(c.env.KV, file.id);
    }
  }

  return c.json({ files: verified });
});

files.delete('/:fileId', async (c) => {
  const fileId = c.req.param('fileId');
  const meta = await getFile(c.env.KV, fileId);

  if (!meta) {
    return c.json({ error: 'File not found' }, 404);
  }

  // Delete from R2
  try {
    await c.env.R2_BUCKET.delete(meta.r2Key);
  } catch {
    // Ignore R2 delete errors (file may already be gone)
  }

  // Delete from KV
  await deleteFile(c.env.KV, fileId);

  return c.json({ success: true });
});

export default files;
