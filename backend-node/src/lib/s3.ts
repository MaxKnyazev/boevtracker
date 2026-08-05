import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';

const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
const publicUrl = process.env.S3_PUBLIC_URL || endpoint;
const bucket = process.env.S3_BUCKET || 'boevtracker';

export const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
});

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<{ key: string; url: string; filename: string }> {
  const ext = originalName.includes('.')
    ? originalName.slice(originalName.lastIndexOf('.'))
    : '';
  const filename = `${randomUUID()}${ext}`;
  const key = `uploads/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return {
    key,
    filename,
    url: `${publicUrl}/${bucket}/${key}`,
  };
}

export async function getFileStream(
  key: string,
): Promise<{ body: Readable; contentType?: string; contentLength?: number }> {
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  return {
    body: result.Body as Readable,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
  };
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export const MAX_FILE_SIZE = 100 * 1024 * 1024;
