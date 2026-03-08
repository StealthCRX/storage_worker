import { Hono } from 'hono';
import {
  listAllDates,
  listSessionsByDate,
  getSession,
  deleteSession,
  removeSessionFromDateIndex,
  getFileLookup,
  deleteFileLookup,
  putSession,
  addSessionToDateIndex,
  putFileLookup,
  SessionMeta,
  SessionFile,
} from '../lib/kv';
import type { Env } from '../types';

const files = new Hono<Env>();

// List all dates (descending)
files.get('/dates', async (c) => {
  const dates = await listAllDates(c.env.KV);
  return c.json({ dates });
});

// Sync R2 objects into KV metadata
files.post('/sync', async (c) => {
  // Key format: {userName}/{date}/{folder}/{filename}
  // folder is "original", "converted/video", or "converted/frames"
  const discovered: Record<string, Record<string, { originals: R2Object[]; converted: R2Object[] }>> = {};

  // Enumerate all R2 objects
  let cursor: string | undefined;
  let totalObjects = 0;
  do {
    const listed = await c.env.R2_BUCKET.list({ cursor, limit: 1000 });
    for (const obj of listed.objects) {
      totalObjects++;
      const parts = obj.key.split('/');
      if (parts.length < 4) continue;

      const uploaderName = parts[0];
      const date = parts[1];
      const folder = parts[2]; // "original" or "converted"
      // For converted, parts[3] is subfolder (video/frames), filename is parts[4]
      // For original, parts[3] is filename
      if (!uploaderName || !date || !folder) continue;

      // Use uploaderName as sessionId for grouping
      const sessionId = `${uploaderName}-${date}`;

      if (!discovered[date]) discovered[date] = {};
      if (!discovered[date][sessionId]) discovered[date][sessionId] = { originals: [], converted: [] };

      if (folder === 'original' || folder === 'originals') {
        discovered[date][sessionId].originals.push(obj);
      } else if (folder === 'converted') {
        discovered[date][sessionId].converted.push(obj);
      }
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  // Rebuild missing KV entries
  let sessionsCreated = 0;
  let filesIndexed = 0;
  const userName = c.get('user');

  for (const [date, sessions] of Object.entries(discovered)) {
    for (const [sessionId, groups] of Object.entries(sessions)) {
      // Check if session already exists in KV
      const existing = await getSession(c.env.KV, sessionId);
      if (existing) continue;

      const sessionFiles: SessionFile[] = [];
      const allObjects = [
        ...groups.originals.map((o) => ({ obj: o, category: 'original' as const })),
        ...groups.converted.map((o) => ({ obj: o, category: 'converted' as const })),
      ];

      for (const { obj, category } of allObjects) {
        const fileId = crypto.randomUUID();
        // Extract filename: last segment for original, or after subfolder for converted
        const keyParts = obj.key.split('/');
        const fileName = keyParts[keyParts.length - 1];
        sessionFiles.push({
          id: fileId,
          name: fileName,
          size: obj.size,
          contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
          category,
          r2Key: obj.key,
          status: 'complete',
          downloads: [],
        });
        await putFileLookup(c.env.KV, fileId, sessionId);
        filesIndexed++;
      }

      const session: SessionMeta = {
        id: sessionId,
        date,
        createdBy: sessionId.split('-').slice(0, -1).join('-') || userName || 'sync',
        createdAt: new Date().toISOString(),
        files: sessionFiles,
      };

      await putSession(c.env.KV, session);
      await addSessionToDateIndex(c.env.KV, date, sessionId);
      sessionsCreated++;
    }
  }

  return c.json({
    totalR2Objects: totalObjects,
    sessionsCreated,
    filesIndexed,
  });
});

// List sessions for a date
files.get('/date/:date', async (c) => {
  const date = c.req.param('date');
  const sessionIds = await listSessionsByDate(c.env.KV, date);

  const sessions = [];
  for (const id of sessionIds) {
    const session = await getSession(c.env.KV, id);
    if (session) sessions.push(session);
  }

  return c.json({ sessions });
});

// Delete a single file
files.delete('/:fileId', async (c) => {
  const fileId = c.req.param('fileId');
  const lookup = await getFileLookup(c.env.KV, fileId);
  if (!lookup) {
    return c.json({ error: 'File not found' }, 404);
  }

  const session = await getSession(c.env.KV, lookup.sessionId);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const file = session.files.find((f) => f.id === fileId);
  if (!file) {
    return c.json({ error: 'File not found in session' }, 404);
  }

  // Delete from R2
  try {
    await c.env.R2_BUCKET.delete(file.r2Key);
  } catch {
    // File may already be gone
  }

  // Remove file from session
  session.files = session.files.filter((f) => f.id !== fileId);
  await deleteFileLookup(c.env.KV, fileId);

  if (session.files.length === 0) {
    // No files left, delete the session entirely
    await deleteSession(c.env.KV, session.id);
    await removeSessionFromDateIndex(c.env.KV, session.date, session.id);
  } else {
    await putSession(c.env.KV, session);
  }

  return c.json({ success: true });
});

// Delete entire session
files.delete('/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const session = await getSession(c.env.KV, sessionId);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Delete all files from R2 and file lookups
  for (const file of session.files) {
    try {
      await c.env.R2_BUCKET.delete(file.r2Key);
    } catch {
      // Ignore
    }
    await deleteFileLookup(c.env.KV, file.id);
  }

  await deleteSession(c.env.KV, sessionId);
  await removeSessionFromDateIndex(c.env.KV, session.date, sessionId);

  return c.json({ success: true });
});

export default files;
