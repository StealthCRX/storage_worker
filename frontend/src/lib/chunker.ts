import { CHUNK_SIZE } from './constants';

export interface FileChunk {
  partNumber: number;
  blob: Blob;
  start: number;
  end: number;
}

export function sliceFile(file: File, chunkSize: number = CHUNK_SIZE): FileChunk[] {
  const chunks: FileChunk[] = [];
  let start = 0;
  let partNumber = 1;

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    chunks.push({
      partNumber,
      blob: file.slice(start, end),
      start,
      end,
    });
    start = end;
    partNumber++;
  }

  return chunks;
}
