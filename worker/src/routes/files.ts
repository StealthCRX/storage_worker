import { Hono } from 'hono';
import { listFiles } from '../lib/kv';

type Env = {
  Bindings: {
    KV: KVNamespace;
  };
};

const files = new Hono<Env>();

files.get('/', async (c) => {
  const allFiles = await listFiles(c.env.KV);

  // Only return complete files to the listing
  const completeFiles = allFiles.filter((f) => f.status === 'complete');

  return c.json({ files: completeFiles });
});

export default files;
