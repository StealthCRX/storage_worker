export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://storage-transfer-worker.stealthcrx.workers.dev';

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export const MAX_CONCURRENT_UPLOADS = 3;

export const MAX_RETRIES = 3;
