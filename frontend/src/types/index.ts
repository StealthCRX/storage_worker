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
  downloads: DownloadEntry[];
}

export interface UploadInitiateResponse {
  fileId: string;
  uploadId: string;
  urls: string[];
  totalParts: number;
  chunkSize: number;
}

export interface AuthPayload {
  sub: string;
  iat: number;
  exp: number;
}
