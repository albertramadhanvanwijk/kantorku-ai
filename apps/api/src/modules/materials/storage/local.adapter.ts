import { randomUUID, createHash, createHmac } from 'node:crypto';
import { mkdir, writeFile, unlink, access } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { storageError } from '@kantorku/shared';
import type { StorageAdapter, SaveResult } from './adapter.js';

export interface LocalAdapterConfig {
  baseDir: string;
  secret: string;
}

function sanitizeFilename(name: string): string {
  const base = basename(name).trim();
  if (!base) return 'file';
  // replace unsafe chars with _
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  // ensure not empty and not '.' or '..'
  if (!safe || safe === '.' || safe === '..') return 'file';
  return safe;
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;
  private readonly secret: string;

  constructor(config: LocalAdapterConfig) {
    this.baseDir = config.baseDir;
    this.secret = config.secret;
  }

  async save(
    file: Buffer,
    opts: { originalName: string; mimeType: string; userId: string },
  ): Promise<SaveResult> {
    const safeName = sanitizeFilename(opts.originalName);
    const id = randomUUID();
    const key = `${opts.userId}/${id}/${safeName}`;
    const fullPath = join(this.baseDir, key);
    const checksum = createHash('sha256').update(file).digest('hex');
    const sizeBytes = file.length;

    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file);
    } catch (err) {
      throw storageError('Failed to save file to local storage', {
        cause: err instanceof Error ? err.message : String(err),
        key,
      });
    }

    return { key, checksum, sizeBytes };
  }

  async getSignedUrl(key: string, ttlSeconds = 3600): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${key}:${expires}`;
    const sig = createHmac('sha256', this.secret).update(payload).digest('hex');
    // Local signed URL served via API route; includes key, expires, sig
    // Encode key segments but keep slashes
    const encodedKey = key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    return `/api/files/${encodedKey}?expires=${expires}&sig=${sig}`;
  }

  async delete(key: string): Promise<void> {
    const fullPath = join(this.baseDir, key);
    try {
      await unlink(fullPath);
    } catch (err) {
      const msg = err instanceof Error ? (err as NodeJS.ErrnoException).message : String(err);
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      throw storageError('Failed to delete file from local storage', {
        cause: msg,
        key,
      });
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = join(this.baseDir, key);
    try {
      await access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
