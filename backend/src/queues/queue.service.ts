import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from '../scanner/scanner.service';
import { StorageService } from '../storage/storage.service';
import IORedis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private redisClient: IORedis | null = null;
  private fileQueue: Queue | null = null;
  private fileWorker: Worker | null = null;
  private isRedisConnected = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scannerService: ScannerService,
    private readonly storageService: StorageService,
  ) {}

  async onModuleInit() {
    await this.initQueue();
  }

  async onModuleDestroy() {
    if (this.fileWorker) {
      await this.fileWorker.close();
    }
    if (this.fileQueue) {
      await this.fileQueue.close();
    }
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }

  private async initQueue() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;

    try {
      this.redisClient = new IORedis({
        host,
        port,
        password,
        lazyConnect: true,
        maxRetriesPerRequest: null,
        connectTimeout: 1500,
        retryStrategy: () => null, // Do not reconnect infinitely if Redis is offline
      });

      this.redisClient.on('connect', () => {
        this.isRedisConnected = true;
        this.logger.log('Connected to Redis for BullMQ processing');
        this.setupBullMQWorker();
      });

      this.redisClient.on('error', (err) => {
        this.isRedisConnected = false;
      });

      // Attempt non-blocking connection
      await Promise.race([
        this.redisClient.connect(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]).catch(() => {
        this.logger.log('Redis server not detected on localhost:6379. Operating in embedded async queue mode.');
      });
    } catch (e: any) {
      this.isRedisConnected = false;
      this.logger.log('Operating in embedded async queue mode.');
    }
  }

  private setupBullMQWorker() {
    if (!this.redisClient || !this.isRedisConnected) return;

    try {
      this.fileQueue = new Queue('previa-file-pipeline', {
        connection: this.redisClient,
      });

      this.fileWorker = new Worker(
        'previa-file-pipeline',
        async (job: Job) => {
          await this.processJob(job.name, job.data);
        },
        { connection: this.redisClient },
      );

      this.fileWorker.on('completed', (job) => {
        this.logger.debug(`Job ${job.id} (${job.name}) completed successfully`);
      });

      this.fileWorker.on('failed', (job, err) => {
        this.logger.error(`Job ${job?.id} (${job?.name}) failed: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Could not start BullMQ worker: ${err.message}`);
    }
  }

  async addScanJob(fileId: string, userId: string, storageKey: string, filename: string) {
    const jobData = { fileId, userId, storageKey, filename };

    if (this.isRedisConnected && this.fileQueue) {
      await this.fileQueue.add('SCAN_FILE', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    } else {
      // Execute asynchronously in background event loop
      setImmediate(() => {
        this.processJob('SCAN_FILE', jobData).catch((err) => {
          this.logger.error(`Background scan job failed for ${fileId}`, err);
        });
      });
    }
  }

  private async processJob(jobName: string, data: any) {
    if (jobName === 'SCAN_FILE') {
      await this.handleScanFile(data);
    }
  }

  private async handleScanFile(data: { fileId: string; userId: string; storageKey: string; filename: string }) {
    const { fileId, userId, storageKey, filename } = data;
    try {
      const fileRecord = await this.prisma.file.findUnique({
        where: { id: fileId },
      });

      if (!fileRecord) return;

      // Stream file buffer to scan
      const { stream, contentLength } = await this.storageService.getFileStream(storageKey);
      const chunks: Buffer[] = [];

      // Read max 10MB into memory for scanning
      const maxScanBytes = 10 * 1024 * 1024;
      let totalRead = 0;

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk) => {
          if (totalRead < maxScanBytes) {
            chunks.push(chunk);
            totalRead += chunk.length;
          }
        });
        stream.on('end', () => resolve());
        stream.on('error', (err) => reject(err));
      });

      const fileBuffer = Buffer.concat(chunks);
      const scanResult = await this.scannerService.scanBuffer(fileBuffer, filename);

      if (scanResult.isClean) {
        await this.prisma.file.update({
          where: { id: fileId },
          data: {
            scanStatus: 'CLEAN',
            scanResult: scanResult.details || 'Scanned Clean',
          },
        });

        await this.prisma.notification.create({
          data: {
            userId,
            title: 'File Upload & Scan Verified',
            message: `"${filename}" passed security inspection with no threats found.`,
            type: 'UPLOAD_SUCCESS',
          },
        });
      } else {
        // Infected file: quarantine and notify user
        await this.prisma.file.update({
          where: { id: fileId },
          data: {
            scanStatus: 'INFECTED',
            scanResult: `${scanResult.virusName || 'Threat Detected'}: ${scanResult.details}`,
          },
        });

        await this.prisma.notification.create({
          data: {
            userId,
            title: 'SECURITY ALERT: Threat Detected',
            message: `Malware detected in uploaded file "${filename}" (${scanResult.virusName}). Access has been quarantined.`,
            type: 'MALWARE_DETECTED',
          },
        });
      }
    } catch (err: any) {
      this.logger.error(`Error processing scan job for ${fileId}: ${err.message}`);
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          scanStatus: 'SKIPPED',
          scanResult: 'Scan skipped or error occurred during inspection',
        },
      });
    }
  }
}
