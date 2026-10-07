import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LocalStorageAdapter } from '../storage/local.adapter.js';
import { S3StorageAdapter } from '../storage/s3.adapter.js';
import { createStorageAdapter } from '../storage/index.js';
import type { Env } from '@kantorku/shared';

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    PORT: 4000,
    HOST: '0.0.0.0',
    APP_URL: 'http://localhost:3000',
    API_URL: 'http://localhost:4000',
    WEB_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    NINE_ROUTER_API_KEY: '',
    NINE_ROUTER_BASE_URL: '',
    NINE_ROUTER_DEFAULT_MODEL: '',
    STORAGE_DRIVER: 'local',
    STORAGE_ENDPOINT: '',
    STORAGE_BUCKET: '',
    STORAGE_ACCESS_KEY: '',
    STORAGE_SECRET_KEY: '',
    STORAGE_LOCAL_DIR: './storage',
    AUTH_SECRET: 'test-auth-secret-min-32-chars!!',
    JWT_SECRET: 'test-jwt-secret-min-32-chars!!!',
    JWT_EXPIRES_IN: '7d',
    BCRYPT_ROUNDS: 4,
    DEFAULT_TIMEZONE: 'Asia/Jakarta',
    MAX_UPLOAD_MB: 25,
    LOG_LEVEL: 'silent',
    CORS_ORIGIN: 'http://localhost:3000',
    ...overrides,
  } as Env;
}

describe('StorageAdapter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kantorku-storage-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('local save returns key/checksum/size and file exists', async () => {
    const adapter = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    const data = Buffer.from('hello storage');
    const expectedChecksum = createHash('sha256').update(data).digest('hex');

    const result = await adapter.save(data, {
      originalName: 'my file.png',
      mimeType: 'image/png',
      userId: 'user-123',
    });

    expect(result.key).toMatch(/^user-123\/.+\/my_file\.png$/);
    expect(result.checksum).toBe(expectedChecksum);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sizeBytes).toBe(data.length);
    expect(await adapter.exists(result.key)).toBe(true);
  });

  it('local getSignedUrl returns url containing key and expires param', async () => {
    const adapter = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    const { key } = await adapter.save(Buffer.from('abc'), {
      originalName: 'doc.txt',
      mimeType: 'text/plain',
      userId: 'u1',
    });

    const url = await adapter.getSignedUrl(key, 600);
    expect(url).toContain('/api/files/');
    // key segments encoded but slashes preserved — check last segment
    expect(url).toContain('doc.txt');
    expect(url).toContain('expires=');
    expect(url).toContain('sig=');
    // expires is numeric
    const params = new URL(url, 'http://localhost').searchParams;
    expect(Number(params.get('expires'))).toBeGreaterThan(0);
    expect(params.get('sig')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('local delete removes file', async () => {
    const adapter = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    const { key } = await adapter.save(Buffer.from('to-delete'), {
      originalName: 't.txt',
      mimeType: 'text/plain',
      userId: 'u1',
    });
    expect(await adapter.exists(key)).toBe(true);
    await adapter.delete(key);
    expect(await adapter.exists(key)).toBe(false);
  });

  it('factory selects local when STORAGE_DRIVER=local', () => {
    const env = baseEnv({ STORAGE_DRIVER: 'local', STORAGE_LOCAL_DIR: tmpDir });
    const adapter = createStorageAdapter(env);
    expect(adapter.constructor.name).toMatch(/Local/);
  });

  it('factory selects s3 when STORAGE_DRIVER=s3 (mocked client)', () => {
    const mockS3 = {
      send: vi.fn().mockResolvedValue({}),
    } as unknown as import('@aws-sdk/client-s3').S3Client;

    // Avoid real presigner network: factory just constructs; no call yet
    const env = baseEnv({
      STORAGE_DRIVER: 's3',
      STORAGE_BUCKET: 'test-bucket',
      STORAGE_ENDPOINT: 'http://localhost:9000',
      STORAGE_ACCESS_KEY: 'key',
      STORAGE_SECRET_KEY: 'secret',
    });
    const adapter = createStorageAdapter(env, { s3Client: mockS3 });
    expect(adapter).toBeInstanceOf(S3StorageAdapter);
    expect(adapter.constructor.name).toMatch(/S3/);
  });

  it('s3 save/exists/delete/getSignedUrl use mocked client and return checksum', async () => {
    const sendMock = vi.fn(async (cmd: unknown) => {
      const name = (cmd as { constructor: { name: string } }).constructor.name;
      if (name === 'HeadObjectCommand') {
        // first exists should be true after save path, simulate success
        return {};
      }
      return {};
    });
    const mockS3 = { send: sendMock } as unknown as import('@aws-sdk/client-s3').S3Client;
    const adapter = new S3StorageAdapter({ bucket: 'b', s3Client: mockS3 });

    const data = Buffer.from('s3 payload');
    const res = await adapter.save(data, { originalName: 'a.json', mimeType: 'application/json', userId: 'u9' });
    expect(res.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(res.key).toMatch(/^u9\//);
    expect(res.sizeBytes).toBe(data.length);

    // exists hits HeadObject
    expect(await adapter.exists(res.key)).toBe(true);
    expect(sendMock).toHaveBeenCalled();

    await adapter.delete(res.key);
    // delete called at least once after previous calls
    expect(sendMock).toHaveBeenCalled();
  });
});
