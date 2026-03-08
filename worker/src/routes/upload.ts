import { Hono } from 'hono';
import { generatePresignedPutUrl } from '../lib/r2';
import {
  putSession,
  getSession,
  addSessionToDateIndex,
  putFileLookup,
  SessionMeta,
  SessionFile,
} from '../lib/kv';
import type { Env } from '../types';

const FIFTY_MB = 50 * 1024 * 1024;

const upload = new Hono<Env>();

upload.post('/session', async (c) => {
  const { files } = await c.req.json<{
    files: { name: string; size: number; contentType: string; category: 'original' | 'converted' }[];
  }>();

  if (!files || files.length === 0) {
    return c.json({ error: 'files array is required' }, 400);
  }

  const sessionId = crypto.randomUUID().slice(0, 8);
  const date = new Date().toISOString().slice(0, 10);
  const userName = c.get('user');

  const presignOpts = {
    accountId: c.env.R2_ACCOUNT_ID,
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    bucketName: c.env.R2_BUCKET_NAME,
  };

  const sessionFiles: SessionFile[] = [];
  const responseFiles: {
    fileId: string;
    uploadId: string;
    urls: string[];
    chunkSize: number;
    totalParts: number;
  }[] = [];

  for (const file of files) {
    const fileId = crypto.randomUUID();
    let folder: string;
    if (file.category === 'converted') {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext);
      folder = isImage ? 'converted/frames' : 'converted/video';
    } else {
      folder = 'original';
    }
    const r2Key = `${userName}/${date}/${folder}/${file.name}`;

    // Dynamic chunk size: max(50MB, ceil(fileSize / 9999))
    const chunkSize = Math.max(FIFTY_MB, Math.ceil(file.size / 9999));
    const totalParts = Math.ceil(file.size / chunkSize);

    // Create multipart upload via R2 binding
    const multipartUpload = await c.env.R2_BUCKET.createMultipartUpload(r2Key, {
      httpMetadata: { contentType: file.contentType },
    });

    // Generate presigned PUT URLs for each part
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

    const sessionFile: SessionFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      contentType: file.contentType,
      category: file.category,
      r2Key,
      status: 'uploading',
      uploadId: multipartUpload.uploadId,
      downloads: [],
    };
    sessionFiles.push(sessionFile);

    // Store file lookup
    await putFileLookup(c.env.KV, fileId, sessionId);

    responseFiles.push({
      fileId,
      uploadId: multipartUpload.uploadId,
      urls,
      chunkSize,
      totalParts,
    });
  }

  const session: SessionMeta = {
    id: sessionId,
    date,
    createdBy: userName,
    createdAt: new Date().toISOString(),
    files: sessionFiles,
  };

  await putSession(c.env.KV, session);
  await addSessionToDateIndex(c.env.KV, date, sessionId);

  return c.json({ sessionId, files: responseFiles });
});

upload.post('/complete-file', async (c) => {
  const { sessionId, fileId, uploadId, parts } = await c.req.json<{
    sessionId: string;
    fileId: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  }>();

  const session = await getSession(c.env.KV, sessionId);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const file = session.files.find((f) => f.id === fileId);
  if (!file) {
    return c.json({ error: 'File not found in session' }, 404);
  }

  try {
    const multipartUpload = c.env.R2_BUCKET.resumeMultipartUpload(file.r2Key, uploadId);
    await multipartUpload.complete(
      parts.map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag.replace(/^"|"$/g, ''),
      })),
    );

    file.status = 'complete';
    delete file.uploadId;
    await putSession(c.env.KV, session);

    return c.json({ success: true, fileId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Complete file failed:', message, { sessionId, fileId, uploadId });
    return c.json({ error: `Complete failed: ${message}` }, 500);
  }
});

upload.post('/abort-file', async (c) => {
  const { sessionId, fileId, uploadId } = await c.req.json<{
    sessionId: string;
    fileId: string;
    uploadId: string;
  }>();

  const session = await getSession(c.env.KV, sessionId);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const file = session.files.find((f) => f.id === fileId);
  if (!file) {
    return c.json({ error: 'File not found in session' }, 404);
  }

  const multipartUpload = c.env.R2_BUCKET.resumeMultipartUpload(file.r2Key, uploadId);
  await multipartUpload.abort();

  file.status = 'failed';
  await putSession(c.env.KV, session);

  return c.json({ success: true });
});

export default upload;
