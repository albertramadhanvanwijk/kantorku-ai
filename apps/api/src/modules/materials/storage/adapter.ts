export interface SaveResult {
  key: string;
  checksum: string;
  sizeBytes: number;
}

export interface StorageAdapter {
  save(
    file: Buffer,
    opts: { originalName: string; mimeType: string; userId: string },
  ): Promise<SaveResult>;
  getSignedUrl(key: string, ttlSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
