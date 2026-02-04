import { FileChunk } from './chunker';
import { MAX_CONCURRENT_UPLOADS, MAX_RETRIES } from './constants';

export interface UploadPartResult {
  partNumber: number;
  etag: string;
}

export type ProgressCallback = (uploaded: number, total: number) => void;

async function uploadPart(
  url: string,
  chunk: FileChunk,
  onProgress?: (bytesUploaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag');
        if (etag) {
          resolve(etag);
        } else {
          reject(new Error('No ETag in response'));
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Upload aborted'));

    xhr.send(chunk.blob);
  });
}

async function uploadPartWithRetry(
  url: string,
  chunk: FileChunk,
  onProgress?: (bytesUploaded: number) => void,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await uploadPart(url, chunk, onProgress);
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

export async function uploadChunks(
  urls: string[],
  chunks: FileChunk[],
  onProgress: ProgressCallback,
): Promise<UploadPartResult[]> {
  const results: UploadPartResult[] = [];
  const totalSize = chunks.reduce((sum, c) => sum + c.blob.size, 0);
  const partProgress = new Map<number, number>();

  let active = 0;
  let nextIndex = 0;

  return new Promise((resolve, reject) => {
    let failed = false;

    function reportProgress() {
      const uploaded = Array.from(partProgress.values()).reduce((a, b) => a + b, 0);
      onProgress(uploaded, totalSize);
    }

    function startNext() {
      if (failed) return;
      if (nextIndex >= chunks.length) {
        if (active === 0) {
          results.sort((a, b) => a.partNumber - b.partNumber);
          resolve(results);
        }
        return;
      }

      const idx = nextIndex++;
      active++;

      uploadPartWithRetry(urls[idx], chunks[idx], (bytes) => {
        partProgress.set(chunks[idx].partNumber, bytes);
        reportProgress();
      })
        .then((etag) => {
          partProgress.set(chunks[idx].partNumber, chunks[idx].blob.size);
          reportProgress();
          results.push({ partNumber: chunks[idx].partNumber, etag });
          active--;
          startNext();
        })
        .catch((err) => {
          failed = true;
          reject(err);
        });
    }

    const concurrent = Math.min(MAX_CONCURRENT_UPLOADS, chunks.length);
    for (let i = 0; i < concurrent; i++) {
      startNext();
    }
  });
}
