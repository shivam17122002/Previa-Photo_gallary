import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IStorageService, StorageStreamResult } from './storage.interface';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class S3StorageAdapter implements IStorageService {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET_NAME || 'previa-storage';
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const region = process.env.S3_REGION || 'auto';
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle,
    });

    this.logger.log(`S3StorageAdapter initialized for bucket: ${this.bucket}`);
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ storageKey: string; size: number }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.s3Client.send(command);
    return { storageKey: key, size: buffer.length };
  }

  async getFileStream(
    key: string,
    range?: { start: number; end: number },
  ): Promise<StorageStreamResult> {
    const rangeHeader = range ? `bytes=${range.start}-${range.end}` : undefined;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Range: rangeHeader,
    });

    try {
      const response = await this.s3Client.send(command);
      return {
        stream: response.Body as Readable,
        contentLength: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        contentRange: response.ContentRange,
        statusCode: range ? 206 : 200,
      };
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('Requested file not found in storage');
      }
      throw err;
    }
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.s3Client.send(command);
  }

  async initMultipart(key: string, mimeType: string): Promise<{ uploadId: string }> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });

    const result = await this.s3Client.send(command);
    if (!result.UploadId) {
      throw new Error('Failed to initialize multipart upload');
    }
    return { uploadId: result.UploadId };
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    buffer: Buffer,
  ): Promise<{ etag: string }> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: buffer,
    });

    const result = await this.s3Client.send(command);
    return { etag: result.ETag || '' };
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({
          PartNumber: p.partNumber,
          ETag: p.etag,
        })),
      },
    });

    await this.s3Client.send(command);
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
    });
    await this.s3Client.send(command);
  }

  async getPresignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }
}
