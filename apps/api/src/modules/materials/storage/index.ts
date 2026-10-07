import type { Env } from '@kantorku/shared';
import { validationError } from '@kantorku/shared';
import type { StorageAdapter } from './adapter.js';
import { LocalStorageAdapter } from './local.adapter.js';
import { S3StorageAdapter } from './s3.adapter.js';
import type { S3Client } from '@aws-sdk/client-s3';

export type StorageFactoryDeps = {
  s3Client?: S3Client;
};

export function createStorageAdapter(config: Env, deps?: StorageFactoryDeps): StorageAdapter {
  const driver = config.STORAGE_DRIVER;

  if (driver === 'local') {
    return new LocalStorageAdapter({
      baseDir: config.STORAGE_LOCAL_DIR,
      secret: config.AUTH_SECRET,
    });
  }

  if (driver === 's3') {
    return new S3StorageAdapter({
      bucket: config.STORAGE_BUCKET,
      endpoint: config.STORAGE_ENDPOINT,
      accessKey: config.STORAGE_ACCESS_KEY,
      secretKey: config.STORAGE_SECRET_KEY,
      s3Client: deps?.s3Client,
    });
  }

  throw validationError(`Unsupported STORAGE_DRIVER: ${String(driver)}`);
}

export type { StorageAdapter, SaveResult } from './adapter.js';
export { LocalStorageAdapter } from './local.adapter.js';
export { S3StorageAdapter } from './s3.adapter.js';
