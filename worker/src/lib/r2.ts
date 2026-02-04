import { AwsClient } from 'aws4fetch';

interface PresignOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

function getR2Client(opts: PresignOptions): AwsClient {
  return new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    region: 'auto',
    service: 's3',
  });
}

function getR2Endpoint(accountId: string, bucketName: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}`;
}

export async function generatePresignedPutUrl(
  opts: PresignOptions,
  key: string,
  partNumber: number,
  uploadId: string,
  expiresIn: number = 21600,
): Promise<string> {
  const client = getR2Client(opts);
  const endpoint = getR2Endpoint(opts.accountId, opts.bucketName);
  const url = new URL(`${endpoint}/${key}`);
  url.searchParams.set('partNumber', String(partNumber));
  url.searchParams.set('uploadId', uploadId);
  url.searchParams.set('X-Amz-Expires', String(expiresIn));

  const signed = await client.sign(
    new Request(url.toString(), { method: 'PUT' }),
    { aws: { signQuery: true } },
  );

  return signed.url;
}

export async function generatePresignedGetUrl(
  opts: PresignOptions,
  key: string,
  expiresIn: number = 3600,
): Promise<string> {
  const client = getR2Client(opts);
  const endpoint = getR2Endpoint(opts.accountId, opts.bucketName);
  const url = new URL(`${endpoint}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(expiresIn));

  const signed = await client.sign(
    new Request(url.toString(), { method: 'GET' }),
    { aws: { signQuery: true } },
  );

  return signed.url;
}
