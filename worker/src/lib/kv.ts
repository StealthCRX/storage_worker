export interface DownloadEntry {
  by: string;
  at: string;
}

export interface FileMeta {
  id: string;
  name: string;
  size: number;
  contentType: string;
  uploadedBy: string;
  uploadedAt: string;
  status: 'uploading' | 'complete' | 'failed';
  r2Key: string;
  uploadId?: string;
  downloads: DownloadEntry[];
}

export async function getFile(kv: KVNamespace, fileId: string): Promise<FileMeta | null> {
  const data = await kv.get(`file:${fileId}`, 'json');
  return data as FileMeta | null;
}

export async function putFile(kv: KVNamespace, meta: FileMeta): Promise<void> {
  await kv.put(`file:${meta.id}`, JSON.stringify(meta));
}

export async function deleteFile(kv: KVNamespace, fileId: string): Promise<void> {
  await kv.delete(`file:${fileId}`);
}

export async function listFiles(kv: KVNamespace): Promise<FileMeta[]> {
  const keys = await kv.list({ prefix: 'file:' });
  const files: FileMeta[] = [];

  for (const key of keys.keys) {
    const data = await kv.get(key.name, 'json');
    if (data) files.push(data as FileMeta);
  }

  return files;
}
