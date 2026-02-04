import { useState, useCallback } from 'react';
import { sliceFile } from '../lib/chunker';
import { uploadChunks, UploadPartResult } from '../lib/uploader';
import { initiateUpload, completeUpload, abortUpload } from '../api/files';

type UploadState = 'idle' | 'uploading' | 'completing' | 'done' | 'error';

export interface UploadStatus {
  state: UploadState;
  progress: number; // 0-100
  fileName: string | null;
  error: string | null;
}

export function useUpload(onComplete?: () => void) {
  const [status, setStatus] = useState<UploadStatus>({
    state: 'idle',
    progress: 0,
    fileName: null,
    error: null,
  });

  const upload = useCallback(
    async (file: File) => {
      setStatus({ state: 'uploading', progress: 0, fileName: file.name, error: null });

      let fileId = '';
      let uploadId = '';

      try {
        // Initiate multipart upload
        const result = await initiateUpload(
          file.name,
          file.size,
          file.type || 'application/octet-stream',
        );
        fileId = result.fileId;
        uploadId = result.uploadId;

        // Slice file into chunks
        const chunks = sliceFile(file, result.chunkSize);

        // Upload chunks with progress
        const parts: UploadPartResult[] = await uploadChunks(
          result.urls,
          chunks,
          (uploaded, total) => {
            setStatus((prev) => ({
              ...prev,
              progress: Math.round((uploaded / total) * 100),
            }));
          },
        );

        // Complete the upload
        setStatus((prev) => ({ ...prev, state: 'completing', progress: 100 }));
        await completeUpload(fileId, uploadId, parts);

        setStatus({ state: 'done', progress: 100, fileName: file.name, error: null });
        onComplete?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setStatus({ state: 'error', progress: 0, fileName: file.name, error: message });

        // Try to abort the multipart upload if it was initiated
        if (fileId && uploadId) {
          abortUpload(fileId, uploadId).catch(() => {});
        }
      }
    },
    [onComplete],
  );

  const reset = useCallback(() => {
    setStatus({ state: 'idle', progress: 0, fileName: null, error: null });
  }, []);

  return { status, upload, reset };
}
