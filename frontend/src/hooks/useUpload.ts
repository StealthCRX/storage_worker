import { useState, useCallback, useRef } from 'react';
import { sliceFile } from '../lib/chunker';
import { uploadChunks, UploadPartResult } from '../lib/uploader';
import { initiateUpload, completeUpload, abortUpload } from '../api/files';

type UploadItemState = 'pending' | 'uploading' | 'completing' | 'done' | 'error' | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  state: UploadItemState;
  progress: number;
  error: string | null;
  fileId?: string;
  uploadId?: string;
}

export function useUpload(onComplete?: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const cancelledRef = useRef<Set<string>>(new Set());

  const updateItem = (id: string, updates: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const uploadFile = useCallback(
    async (item: UploadItem) => {
      const { id, file } = item;

      if (cancelledRef.current.has(id)) return;

      updateItem(id, { state: 'uploading', progress: 0 });

      let fileId = '';
      let uploadId = '';

      try {
        const result = await initiateUpload(
          file.name,
          file.size,
          file.type || 'application/octet-stream',
        );
        fileId = result.fileId;
        uploadId = result.uploadId;

        updateItem(id, { fileId, uploadId });

        if (cancelledRef.current.has(id)) {
          abortUpload(fileId, uploadId).catch(() => {});
          return;
        }

        const chunks = sliceFile(file, result.chunkSize);

        const parts: UploadPartResult[] = await uploadChunks(
          result.urls,
          chunks,
          (uploaded, total) => {
            if (!cancelledRef.current.has(id)) {
              updateItem(id, { progress: Math.round((uploaded / total) * 100) });
            }
          },
        );

        if (cancelledRef.current.has(id)) {
          abortUpload(fileId, uploadId).catch(() => {});
          return;
        }

        updateItem(id, { state: 'completing', progress: 100 });
        await completeUpload(fileId, uploadId, parts);

        updateItem(id, { state: 'done', progress: 100 });
        onComplete?.();
      } catch (err) {
        if (cancelledRef.current.has(id)) return;
        const message = err instanceof Error ? err.message : 'Upload failed';
        updateItem(id, { state: 'error', progress: 0, error: message });

        if (fileId && uploadId) {
          abortUpload(fileId, uploadId).catch(() => {});
        }
      }
    },
    [onComplete],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: UploadItem[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        state: 'pending' as const,
        progress: 0,
        error: null,
      }));

      setItems((prev) => [...prev, ...newItems]);
      newItems.forEach((item) => uploadFile(item));
    },
    [uploadFile],
  );

  const cancelItem = useCallback((id: string) => {
    cancelledRef.current.add(id);
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.fileId && item?.uploadId) {
        abortUpload(item.fileId, item.uploadId).catch(() => {});
      }
      return prev.map((i) => (i.id === id ? { ...i, state: 'cancelled' as const } : i));
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    cancelledRef.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearDone = useCallback(() => {
    setItems((prev) =>
      prev.filter((i) => i.state !== 'done' && i.state !== 'error' && i.state !== 'cancelled'),
    );
  }, []);

  const hasActive = items.some(
    (i) => i.state === 'uploading' || i.state === 'completing' || i.state === 'pending',
  );

  return { items, addFiles, cancelItem, removeItem, clearDone, hasActive };
}
