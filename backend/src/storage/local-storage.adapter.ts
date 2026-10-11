import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IStorageService, StorageStreamResult } from './storage.interface';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

@Injectable()
export class LocalStorageAdapter implements IStorageService {
  private readonly logger = new Logger(LocalStorageAdapter.name);
  private readonly basePath: string;

  constructor() {
    this.basePath = path.resolve(process.env.STORAGE_LOCAL_PATH || './uploads');
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
    const chunksPath = path.join(this.basePath, '.chunks');
    if (!fs.existsSync(chunksPath)) {
      fs.mkdirSync(chunksPath, { recursive: true });
    }
    this.logger.log(`LocalStorageAdapter initialized with basePath: ${this.basePath}`);
  }

  private resolveKeyPath(key: string): string {
    const safeKey = key.replace(/\\/g, '/');
    const fullPath = path.join(this.basePath, safeKey);
    // Path traversal check
    if (!fullPath.startsWith(this.basePath)) {
      throw new Error('Access denied: invalid storage key');
    }
    return fullPath;
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ storageKey: string; size: number }> {
    const fullPath = this.resolveKeyPath(key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(fullPath, buffer);
    return { storageKey: key, size: buffer.length };
  }

  async getFileStream(
    key: string,
    range?: { start: number; end: number },
  ): Promise<StorageStreamResult> {
    const fullPath = this.resolveKeyPath(key);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Requested file not found in storage');
    }

    const stat = await fs.promises.stat(fullPath);
    const fileSize = stat.size;

    if (range) {
      let { start, end } = range;
      if (isNaN(start)) start = 0;
      if (isNaN(end) || end >= fileSize) end = fileSize - 1;

      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(fullPath, { start, end });

      return {
        stream,
        contentLength: chunkSize,
        contentType: 'application/octet-stream',
        contentRange: `bytes ${start}-${end}/${fileSize}`,
        statusCode: 206,
      };
    }

    const stream = fs.createReadStream(fullPath);
    return {
      stream,
      contentLength: fileSize,
      contentType: 'application/octet-stream',
      statusCode: 200,
    };
  }

  async deleteFile(key: string): Promise<void> {
    const fullPath = this.resolveKeyPath(key);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }

  async initMultipart(key: string, mimeType: string): Promise<{ uploadId: string }> {
    const uploadId = 'upload_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const uploadDir = path.join(this.basePath, '.chunks', uploadId);
    fs.mkdirSync(uploadDir, { recursive: true });
    return { uploadId };
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    buffer: Buffer,
  ): Promise<{ etag: string }> {
    const partPath = path.join(this.basePath, '.chunks', uploadId, `part_${partNumber}`);
    await fs.promises.writeFile(partPath, buffer);
    return { etag: `etag_part_${partNumber}_${buffer.length}` };
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    const fullPath = this.resolveKeyPath(key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(fullPath);
    const uploadDir = path.join(this.basePath, '.chunks', uploadId);

    // Sort parts by partNumber ascending
    const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    for (const part of sortedParts) {
      const partPath = path.join(uploadDir, `part_${part.partNumber}`);
      if (fs.existsSync(partPath)) {
        const chunkBuffer = await fs.promises.readFile(partPath);
        writeStream.write(chunkBuffer);
        await fs.promises.unlink(partPath);
      }
    }

    writeStream.end();

    // Clean up upload dir
    try {
      if (fs.existsSync(uploadDir)) {
        await fs.promises.rm(uploadDir, { recursive: true, force: true });
      }
    } catch (e) {
      this.logger.warn(`Could not remove chunk dir: ${uploadDir}`);
    }
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    const uploadDir = path.join(this.basePath, '.chunks', uploadId);
    if (fs.existsSync(uploadDir)) {
      await fs.promises.rm(uploadDir, { recursive: true, force: true });
    }
  }
}
