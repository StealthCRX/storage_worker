import { Hono } from 'hono';
import { generatePresignedGetUrl } from '../lib/r2';
import { getFile, putFile } from '../lib/kv';

type Env = {
  Bindings: {
    KV: KVNamespace;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_ACCOUNT_ID: string;
    R2_BUCKET_NAME: string;
  };
  Variables: {
    user: string;
  };
};

const download = new Hono<Env>();

download.post('/:fileId', async (c) => {
  const fileId = c.req.param('fileId');
  const meta = await getFile(c.env.KV, fileId);

  if (!meta || meta.status !== 'complete') {
    return c.json({ error: 'File not found' }, 404);
  }

  // Generate presigned GET URL
  const url = await generatePresignedGetUrl(
    {
      accountId: c.env.R2_ACCOUNT_ID,
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
      bucketName: c.env.R2_BUCKET_NAME,
    },
    meta.r2Key,
  );

  // Log the download
  const userName = c.get('user');
  meta.downloads.push({ by: userName, at: new Date().toISOString() });
  await putFile(c.env.KV, meta);

  return c.json({ url, fileName: meta.name });
});

export default download;
