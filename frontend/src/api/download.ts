import { apiFetch } from './client';

export async function getDownloadUrl(fileId: string): Promise<{ url: string; fileName: string }> {
  return apiFetch<{ url: string; fileName: string }>(`/api/download/${fileId}`, {
    method: 'POST',
  });
}
