import { Injectable, Logger } from '@nestjs/common';
import { IStorageService, StorageStreamResult } from './storage.interface';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';

@Injectable()
export class StorageService implements IStorageService {
  private readonly logger = new Logger(StorageService.name);
  private adapter: IStorageService;

  constructor(
    private readonly localAdapter: LocalStorageAdapter,
    private readonly s3Adapter: S3StorageAdapter,
  ) {
    const driver = process.env.STORAGE_DRIVER || 'local';
    if (driver === 's3' || driver === 'r2') {
      this.adapter = this.s3Adapter;
      this.logger.log(`Using Cloudflare R2 / S3 storage driver`);
    } else {
      this.adapter = this.localAdapter;
      this.logger.log(`Using Local Disk storage driver`);
    }
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ storageKey: string; size: number }> {
    return this.adapter.uploadFile(key, buffer, mimeType);
  }

  async getFileStream(
    key: string,
    range?: { start: number; end: number },
  ): Promise<StorageStreamResult> {
    return this.adapter.getFileStream(key, range);
  }

  async deleteFile(key: string): Promise<void> {
    return this.adapter.deleteFile(key);
  }

  async initMultipart(key: string, mimeType: string): Promise<{ uploadId: string }> {
    return this.adapter.initMultipart(key, mimeType);
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    buffer: Buffer,
  ): Promise<{ etag: string }> {
    return this.adapter.uploadPart(key, uploadId, partNumber, buffer);
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    return this.adapter.completeMultipart(key, uploadId, parts);
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    return this.adapter.abortMultipart(key, uploadId);
  }

  async getPresignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    if (this.adapter.getPresignedDownloadUrl) {
      return this.adapter.getPresignedDownloadUrl(key, expiresInSeconds);
    }
    return '';
  }
}
