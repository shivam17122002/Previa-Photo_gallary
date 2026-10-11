import { Readable } from 'stream';

export interface StorageStreamResult {
  stream: Readable;
  contentLength: number;
  contentType: string;
  contentRange?: string;
  statusCode?: number;
}

export interface IStorageService {
  uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ storageKey: string; size: number }>;

  getFileStream(
    key: string,
    range?: { start: number; end: number },
  ): Promise<StorageStreamResult>;

  deleteFile(key: string): Promise<void>;

  initMultipart(
    key: string,
    mimeType: string,
  ): Promise<{ uploadId: string }>;

  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    buffer: Buffer,
  ): Promise<{ etag: string }>;

  completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void>;

  abortMultipart(key: string, uploadId: string): Promise<void>;

  getPresignedDownloadUrl?(key: string, expiresInSeconds?: number): Promise<string>;
}
