import { apiFetch } from './client';
import { FileMeta, UploadInitiateResponse } from '../types';

export async function listFiles(): Promise<FileMeta[]> {
  const { files } = await apiFetch<{ files: FileMeta[] }>('/api/files');
  return files;
}

export async function initiateUpload(
  fileName: string,
  fileSize: number,
  contentType: string,
): Promise<UploadInitiateResponse> {
  return apiFetch<UploadInitiateResponse>('/api/upload/initiate', {
    method: 'POST',
    body: JSON.stringify({ fileName, fileSize, contentType }),
  });
}

export async function completeUpload(
  fileId: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  await apiFetch('/api/upload/complete', {
    method: 'POST',
    body: JSON.stringify({ fileId, uploadId, parts }),
  });
}

export async function abortUpload(fileId: string, uploadId: string): Promise<void> {
  await apiFetch('/api/upload/abort', {
    method: 'POST',
    body: JSON.stringify({ fileId, uploadId }),
  });
}
