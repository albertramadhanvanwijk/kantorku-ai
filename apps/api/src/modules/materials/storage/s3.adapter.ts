import { createHash } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presignGetObject } from '@aws-sdk/s3-request-presigner';
import { storageError } from '@kantorku/shared';
import type { StorageAdapter, SaveResult } from './adapter.js';

export interface S3AdapterConfig {
  bucket: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  s3Client?: S3Client;
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: S3AdapterConfig) {
    if (!config.bucket) {
      throw storageError('S3 bucket is required when STORAGE_DRIVER=s3');
    }
    this.bucket = config.bucket;

    if (config.s3Client) {
      this.client = config.s3Client;
    } else {
      this.client = new S3Client({
        region: config.region ?? 'us-east-1',
        endpoint: config.endpoint || undefined,
        forcePathStyle: Boolean(config.endpoint),
        credentials:
          config.accessKey && config.secretKey
            ? { accessKeyId: config.accessKey, secretAccessKey: config.secretKey }
            : undefined,
      });
    }
  }

  async save(
    file: Buffer,
    opts: { originalName: string; mimeType: string; userId: string },
  ): Promise<SaveResult> {
    const base = opts.originalName.split('/').pop()?.split('\\').pop() ?? 'file';
    const safeName = (base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file');
    const { randomUUID } = await import('node:crypto');
    const key = `${opts.userId}/${randomUUID()}/${safeName}`;
    const checksum = createHash('sha256').update(file).digest('hex');
    const sizeBytes = file.length;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file,
          ContentType: opts.mimeType,
        }),
      );
    } catch (err) {
      throw storageError('Failed to save file to S3', {
        cause: err instanceof Error ? err.message : String(err),
        key,
      });
    }

    return { key, checksum, sizeBytes };
  }

  async getSignedUrl(key: string, ttlSeconds = 3600): Promise<string> {
    try {
      const url = await presignGetObject(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: ttlSeconds },
      );
      return url;
    } catch (err) {
      throw storageError('Failed to generate signed URL', {
        cause: err instanceof Error ? err.message : String(err),
        key,
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      throw storageError('Failed to delete file from S3', {
        cause: err instanceof Error ? err.message : String(err),
        key,
      });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // S3 HeadObject throws with name/ status 404 when not found
      const statusCode = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      if (
        statusCode === 404 ||
        message.includes('404') ||
        message.includes('NotFound') ||
        (err as { name?: string }).name === 'NotFound'
      ) {
        return false;
      }
      throw storageError('Failed to check file existence in S3', {
        cause: message,
        key,
      });
    }
  }
}
