import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  PayloadTooLargeException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queues/queue.service';
import { InitChunkDto } from './dto/init-chunk.dto';
import { CompleteChunkDto } from './dto/complete-chunk.dto';
import { RenameFileDto } from './dto/rename-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { sanitizeFilename, getFileCategory } from '../common/utils/file.utils';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly queueService: QueueService,
  ) {}

  private async checkUserQuota(userId: string, addedBytes: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { storageQuota: true, usedStorage: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentUsed = user.usedStorage;
    const quota = user.storageQuota;

    if (currentUsed + BigInt(addedBytes) > quota) {
      throw new PayloadTooLargeException(
        `Storage quota exceeded. Available: ${Number(quota - currentUsed)} bytes, Required: ${addedBytes} bytes`,
      );
    }
  }

  async uploadSingle(
    userId: string,
    file: Express.Multer.File,
    folderId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    await this.checkUserQuota(userId, file.size);

    if (folderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: folderId, userId, isTrash: false },
      });
      if (!folder) {
        throw new NotFoundException('Destination folder not found');
      }
    }

    const fileId = uuidv4();
    const cleanName = sanitizeFilename(file.originalname);
    const storageKey = `users/${userId}/${fileId}-${cleanName}`;

    // Upload to storage
    await this.storageService.uploadFile(storageKey, file.buffer, file.mimetype);

    // Save File record
    const fileRecord = await this.prisma.file.create({
      data: {
        id: fileId,
        name: cleanName,
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        size: BigInt(file.size),
        storageKey,
        folderId: folderId || null,
        userId,
        scanStatus: 'PENDING',
      },
    });

    // Update user used storage
    await this.prisma.user.update({
      where: { id: userId },
      data: { usedStorage: { increment: BigInt(file.size) } },
    });

    // Queue malware scan
    await this.queueService.addScanJob(fileRecord.id, userId, storageKey, cleanName);

    return this.serializeFile(fileRecord);
  }

  async initChunkUpload(userId: string, dto: InitChunkDto) {
    await this.checkUserQuota(userId, dto.fileSize);

    if (dto.folderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: dto.folderId, userId, isTrash: false },
      });
      if (!folder) {
        throw new NotFoundException('Destination folder not found');
      }
    }

    const fileId = uuidv4();
    const cleanName = sanitizeFilename(dto.fileName);
    const storageKey = `users/${userId}/${fileId}-${cleanName}`;

    const { uploadId } = await this.storageService.initMultipart(storageKey, dto.mimeType);

    const session = await this.prisma.uploadSession.create({
      data: {
        id: fileId,
        uploadId,
        storageKey,
        fileName: cleanName,
        fileSize: BigInt(dto.fileSize),
        mimeType: dto.mimeType,
        totalParts: dto.totalParts,
        userId,
        folderId: dto.folderId || null,
        status: 'INITIALIZED',
      },
    });

    return {
      sessionId: session.id,
      uploadId,
      storageKey,
      totalParts: session.totalParts,
    };
  }

  async uploadChunkPart(
    userId: string,
    sessionId: string,
    partNumber: number,
    file: Express.Multer.File,
  ) {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Upload session not found or unauthorized');
    }

    const { etag } = await this.storageService.uploadPart(
      session.storageKey,
      session.uploadId,
      partNumber,
      file.buffer,
    );

    // Save part record
    await this.prisma.uploadPart.upsert({
      where: {
        sessionId_partNumber: {
          sessionId,
          partNumber,
        },
      },
      update: {
        etag,
        size: BigInt(file.size),
        uploadedAt: new Date(),
      },
      create: {
        sessionId,
        partNumber,
        etag,
        size: BigInt(file.size),
      },
    });

    return { partNumber, etag, size: file.size };
  }

  async completeChunkUpload(userId: string, dto: CompleteChunkDto) {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id: dto.sessionId, userId },
      include: { parts: true },
    });

    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    await this.storageService.completeMultipart(
      session.storageKey,
      session.uploadId,
      dto.parts,
    );

    // Create file record
    const fileRecord = await this.prisma.file.create({
      data: {
        id: session.id,
        name: session.fileName,
        originalName: session.fileName,
        mimeType: session.mimeType,
        size: session.fileSize,
        storageKey: session.storageKey,
        folderId: session.folderId,
        userId,
        scanStatus: 'PENDING',
      },
    });

    // Update session status
    await this.prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED' },
    });

    // Increment user quota
    await this.prisma.user.update({
      where: { id: userId },
      data: { usedStorage: { increment: session.fileSize } },
    });

    // Queue malware scan
    await this.queueService.addScanJob(
      fileRecord.id,
      userId,
      session.storageKey,
      session.fileName,
    );

    return this.serializeFile(fileRecord);
  }

  async list(
    userId: string,
    params: {
      folderId?: string;
      search?: string;
      isFavorite?: boolean;
      isTrash?: boolean;
      category?: string;
      sortBy?: string;
      order?: 'asc' | 'desc';
      all?: boolean;
    },
  ) {
    const where: any = {
      userId,
      isTrash: params.isTrash === true,
    };

    if (params.isFavorite !== undefined) {
      where.isFavorite = params.isFavorite;
    }

    if (!params.all && !params.search && params.isTrash !== true && params.isFavorite !== true) {
      where.folderId = params.folderId || null;
    }

    if (params.search) {
      where.name = { contains: params.search, mode: 'insensitive' };
    }

    const sortField = params.sortBy === 'size' ? 'size' : params.sortBy === 'name' ? 'name' : 'createdAt';
    const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

    const files = await this.prisma.file.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      include: {
        folder: { select: { id: true, name: true } },
      },
    });

    let results = files.map((f) => this.serializeFile(f));

    if (params.category && ['image', 'video', 'audio', 'document', 'other'].includes(params.category)) {
      results = results.filter((f) => f.category === params.category);
    }

    return results;
  }

  async getById(userId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
      include: {
        folder: { select: { id: true, name: true } },
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return this.serializeFile(file);
  }

  async getFileStream(userId: string, fileId: string, range?: { start: number; end: number }) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.scanStatus === 'INFECTED') {
      throw new ForbiddenException('This file has been quarantined due to a detected security threat.');
    }

    const streamResult = await this.storageService.getFileStream(file.storageKey, range);

    return {
      ...streamResult,
      filename: file.name,
      mimeType: file.mimeType,
      size: Number(file.size),
    };
  }

  async rename(userId: string, fileId: string, dto: RenameFileDto) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, isTrash: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const originalExt = path.extname(file.name);
    let newCleanName = sanitizeFilename(dto.name);

    // Keep extension if user didn't provide one
    if (!path.extname(newCleanName) && originalExt) {
      newCleanName = `${newCleanName}${originalExt}`;
    }

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { name: newCleanName },
    });

    return this.serializeFile(updated);
  }

  async move(userId: string, fileId: string, dto: MoveFileDto) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, isTrash: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const targetFolderId = dto.targetFolderId || null;

    if (targetFolderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: targetFolderId, userId, isTrash: false },
      });
      if (!folder) {
        throw new NotFoundException('Destination folder not found');
      }
    }

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { folderId: targetFolderId },
    });

    return this.serializeFile(updated);
  }

  async toggleFavorite(userId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, isTrash: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { isFavorite: !file.isFavorite },
    });

    return this.serializeFile(updated);
  }

  async softDelete(userId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, isTrash: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { isTrash: true, trashedAt: new Date() },
    });

    return { message: 'File moved to trash', file: this.serializeFile(updated) };
  }

  async restore(userId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, isTrash: true },
    });

    if (!file) {
      throw new NotFoundException('File not found in trash');
    }

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { isTrash: false, trashedAt: null },
    });

    return { message: 'File restored from trash', file: this.serializeFile(updated) };
  }

  async permanentDelete(userId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, isTrash: true },
    });

    if (!file) {
      throw new NotFoundException('File not found in trash');
    }

    // Delete from storage
    try {
      await this.storageService.deleteFile(file.storageKey);
    } catch (err: any) {
      this.logger.warn(`Storage delete error for ${file.storageKey}: ${err.message}`);
    }

    // Delete from DB
    await this.prisma.file.delete({
      where: { id: fileId },
    });

    // Decrement user storage
    await this.prisma.user.update({
      where: { id: userId },
      data: { usedStorage: { decrement: file.size } },
    });

    return { message: 'File permanently deleted' };
  }

  async emptyTrash(userId: string) {
    const trashedFiles = await this.prisma.file.findMany({
      where: { userId, isTrash: true },
    });

    let totalFreedBytes = BigInt(0);

    for (const f of trashedFiles) {
      try {
        await this.storageService.deleteFile(f.storageKey);
      } catch (e: any) {
        this.logger.warn(`Failed to delete storage file ${f.storageKey}: ${e.message}`);
      }
      totalFreedBytes += f.size;
    }

    await this.prisma.file.deleteMany({
      where: { userId, isTrash: true },
    });

    await this.prisma.folder.deleteMany({
      where: { userId, isTrash: true },
    });

    if (totalFreedBytes > BigInt(0)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { usedStorage: { decrement: totalFreedBytes } },
      });
    }

    return { message: 'Trash emptied successfully', freedBytes: totalFreedBytes.toString() };
  }

  async getDashboardStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { storageQuota: true, usedStorage: true },
    });

    const activeFiles = await this.prisma.file.findMany({
      where: { userId, isTrash: false },
      select: { size: true, mimeType: true, name: true },
    });

    let imagesBytes = BigInt(0);
    let videosBytes = BigInt(0);
    let audioBytes = BigInt(0);
    let docsBytes = BigInt(0);
    let otherBytes = BigInt(0);

    let imagesCount = 0;
    let videosCount = 0;
    let audioCount = 0;
    let docsCount = 0;
    let otherCount = 0;

    for (const f of activeFiles) {
      const cat = getFileCategory(f.mimeType, f.name);
      if (cat === 'image') {
        imagesBytes += f.size;
        imagesCount++;
      } else if (cat === 'video') {
        videosBytes += f.size;
        videosCount++;
      } else if (cat === 'audio') {
        audioBytes += f.size;
        audioCount++;
      } else if (cat === 'document') {
        docsBytes += f.size;
        docsCount++;
      } else {
        otherBytes += f.size;
        otherCount++;
      }
    }

    const folderCount = await this.prisma.folder.count({
      where: { userId, isTrash: false },
    });

    const recentFiles = await this.prisma.file.findMany({
      where: { userId, isTrash: false },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const favoriteFiles = await this.prisma.file.findMany({
      where: { userId, isFavorite: true, isTrash: false },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });

    return {
      storage: {
        quota: user?.storageQuota.toString() || '0',
        used: user?.usedStorage.toString() || '0',
        breakdown: {
          images: { bytes: imagesBytes.toString(), count: imagesCount },
          videos: { bytes: videosBytes.toString(), count: videosCount },
          audio: { bytes: audioBytes.toString(), count: audioCount },
          documents: { bytes: docsBytes.toString(), count: docsCount },
          other: { bytes: otherBytes.toString(), count: otherCount },
        },
      },
      counts: {
        files: activeFiles.length,
        folders: folderCount,
      },
      recentFiles: recentFiles.map((f) => this.serializeFile(f)),
      favoriteFiles: favoriteFiles.map((f) => this.serializeFile(f)),
    };
  }

  private serializeFile(file: any) {
    return {
      id: file.id,
      name: file.name,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size.toString(),
      folderId: file.folderId,
      folder: file.folder,
      isFavorite: file.isFavorite,
      isTrash: file.isTrash,
      trashedAt: file.trashedAt,
      scanStatus: file.scanStatus,
      scanResult: file.scanResult,
      category: getFileCategory(file.mimeType, file.name),
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }
}
