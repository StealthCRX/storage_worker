import { Hono } from 'hono';
import { generatePresignedPutUrl } from '../lib/r2';
import { putFile, getFile, FileMeta } from '../lib/kv';

type Env = {
  Bindings: {
    R2_BUCKET: R2Bucket;
    KV: KVNamespace;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_ACCOUNT_ID: string;
    R2_BUCKET_NAME: string;
    CHUNK_SIZE: string;
  };
  Variables: {
    user: string;
  };
};

const upload = new Hono<Env>();

upload.post('/initiate', async (c) => {
  const { fileName, fileSize, contentType } = await c.req.json<{
    fileName: string;
    fileSize: number;
    contentType: string;
  }>();

  if (!fileName || !fileSize || !contentType) {
    return c.json({ error: 'fileName, fileSize, and contentType are required' }, 400);
  }

  const fileId = crypto.randomUUID();
  const r2Key = `Data Upload/${fileId}/${fileName}`;
  const chunkSize = parseInt(c.env.CHUNK_SIZE) || 26214400;
  const totalParts = Math.ceil(fileSize / chunkSize);

  // Create multipart upload via R2 binding
  const multipartUpload = await c.env.R2_BUCKET.createMultipartUpload(r2Key, {
    httpMetadata: { contentType },
  });

  // Generate presigned PUT URLs for each part
  const presignOpts = {
    accountId: c.env.R2_ACCOUNT_ID,
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    bucketName: c.env.R2_BUCKET_NAME,
  };

  const urls: string[] = [];
  for (let i = 1; i <= totalParts; i++) {
    const url = await generatePresignedPutUrl(
      presignOpts,
      r2Key,
      i,
      multipartUpload.uploadId,
    );
    urls.push(url);
  }

  // Store metadata in KV
  const meta: FileMeta = {
    id: fileId,
    name: fileName,
    size: fileSize,
    contentType,
    uploadedBy: c.get('user'),
    uploadedAt: new Date().toISOString(),
    status: 'uploading',
    r2Key,
    uploadId: multipartUpload.uploadId,
    downloads: [],
  };
  await putFile(c.env.KV, meta);

  return c.json({
    fileId,
    uploadId: multipartUpload.uploadId,
    urls,
    totalParts,
    chunkSize,
  });
});

upload.post('/complete', async (c) => {
  const { fileId, uploadId, parts } = await c.req.json<{
    fileId: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  }>();

  const meta = await getFile(c.env.KV, fileId);
  if (!meta) {
    return c.json({ error: 'File not found' }, 404);
  }

  // Complete multipart upload via R2 binding
  const multipartUpload = c.env.R2_BUCKET.resumeMultipartUpload(meta.r2Key, uploadId);

  await multipartUpload.complete(
    parts.map((p) => ({
      partNumber: p.partNumber,
      etag: p.etag,
    })),
  );

  // Update KV metadata
  meta.status = 'complete';
  delete meta.uploadId;
  await putFile(c.env.KV, meta);

  return c.json({ success: true, fileId });
});

upload.post('/abort', async (c) => {
  const { fileId, uploadId } = await c.req.json<{
    fileId: string;
    uploadId: string;
  }>();

  const meta = await getFile(c.env.KV, fileId);
  if (!meta) {
    return c.json({ error: 'File not found' }, 404);
  }

  const multipartUpload = c.env.R2_BUCKET.resumeMultipartUpload(meta.r2Key, uploadId);
  await multipartUpload.abort();

  meta.status = 'failed';
  await putFile(c.env.KV, meta);

  return c.json({ success: true });
});

export default upload;
