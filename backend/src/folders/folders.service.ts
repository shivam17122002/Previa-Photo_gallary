import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { MoveFolderDto } from './dto/move-folder.dto';
import { sanitizeFilename } from '../common/utils/file.utils';

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async create(userId: string, dto: CreateFolderDto) {
    const cleanName = sanitizeFilename(dto.name);
    if (!cleanName) {
      throw new BadRequestException('Folder name cannot be empty');
    }

    // If parentId provided, verify user owns parent folder
    if (dto.parentId) {
      const parent = await this.prisma.folder.findFirst({
        where: { id: dto.parentId, userId, isTrash: false },
      });
      if (!parent) {
        throw new NotFoundException('Parent folder not found or does not belong to you');
      }
    }

    // Check for duplicate folder name in the same directory
    const existing = await this.prisma.folder.findFirst({
      where: {
        userId,
        name: cleanName,
        parentId: dto.parentId || null,
        isTrash: false,
      },
    });

    if (existing) {
      throw new BadRequestException('A folder with this name already exists in this location');
    }

    return this.prisma.folder.create({
      data: {
        name: cleanName,
        userId,
        parentId: dto.parentId || null,
      },
    });
  }

  async list(userId: string, parentId?: string) {
    const where: any = {
      userId,
      isTrash: false,
      parentId: parentId || null,
    };

    const folders = await this.prisma.folder.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            files: { where: { isTrash: false } },
            children: { where: { isTrash: false } },
          },
        },
      },
    });

    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      fileCount: f._count.files,
      folderCount: f._count.children,
    }));
  }

  async listTrash(userId: string) {
    const folders = await this.prisma.folder.findMany({
      where: { userId, isTrash: true },
      orderBy: { trashedAt: 'desc' },
      select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true },
    });
    const trashedIds = new Set(folders.map((folder) => folder.id));
    return folders
      .filter((folder) => !folder.parentId || !trashedIds.has(folder.parentId))
      .map((folder) => ({ ...folder, fileCount: 0, folderCount: 0 }));
  }

  async getBreadcrumbs(userId: string, folderId: string) {
    const breadcrumbs: { id: string; name: string }[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: currentId, userId },
        select: { id: true, name: true, parentId: true },
      });

      if (!folder) break;

      breadcrumbs.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parentId;
    }

    return breadcrumbs;
  }

  async rename(userId: string, folderId: string, dto: RenameFolderDto) {
    const cleanName = sanitizeFilename(dto.name);
    if (!cleanName) {
      throw new BadRequestException('Folder name cannot be empty');
    }

    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, userId, isTrash: false },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Check duplicate name
    const existing = await this.prisma.folder.findFirst({
      where: {
        userId,
        name: cleanName,
        parentId: folder.parentId,
        isTrash: false,
        id: { not: folderId },
      },
    });

    if (existing) {
      throw new BadRequestException('A folder with this name already exists in this location');
    }

    return this.prisma.folder.update({
      where: { id: folderId },
      data: { name: cleanName },
    });
  }

  async move(userId: string, folderId: string, dto: MoveFolderDto) {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, userId, isTrash: false },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    const targetParentId = dto.targetParentId || null;

    if (targetParentId === folderId) {
      throw new BadRequestException('Cannot move a folder into itself');
    }

    if (targetParentId) {
      const targetParent = await this.prisma.folder.findFirst({
        where: { id: targetParentId, userId, isTrash: false },
      });

      if (!targetParent) {
        throw new NotFoundException('Destination folder not found');
      }

      // Cycle detection: ensure targetParent is not inside folderId
      let ancestorId: string | null = targetParentId;
      while (ancestorId) {
        if (ancestorId === folderId) {
          throw new BadRequestException('Cannot move a folder into one of its subfolders');
        }
        const ancestor = await this.prisma.folder.findUnique({
          where: { id: ancestorId },
          select: { parentId: true },
        });
        ancestorId = ancestor?.parentId || null;
      }
    }

    return this.prisma.folder.update({
      where: { id: folderId },
      data: { parentId: targetParentId },
    });
  }

  async softDelete(userId: string, folderId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, userId, isTrash: false },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    const now = new Date();
    // Recursively collect all descendant folder IDs
    const descendantFolderIds = await this.getAllDescendantFolderIds(userId, folderId);
    const allFolderIds = [folderId, ...descendantFolderIds];

    // Mark folders as trash
    await this.prisma.folder.updateMany({
      where: { id: { in: allFolderIds }, userId },
      data: { isTrash: true, trashedAt: now },
    });

    // Mark all contained files as trash
    await this.prisma.file.updateMany({
      where: { folderId: { in: allFolderIds }, userId, isTrash: false },
      data: { isTrash: true, trashedAt: now },
    });

    return { message: 'Folder and contents moved to trash', folderId };
  }

  async restore(userId: string, folderId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, userId, isTrash: true },
    });

    if (!folder) {
      throw new NotFoundException('Trashed folder not found');
    }

    const descendantFolderIds = await this.getAllDescendantFolderIds(userId, folderId, true);
    const allFolderIds = [folderId, ...descendantFolderIds];

    await this.prisma.folder.updateMany({
      where: { id: { in: allFolderIds }, userId },
      data: { isTrash: false, trashedAt: null },
    });

    await this.prisma.file.updateMany({
      where: { folderId: { in: allFolderIds }, userId, isTrash: true },
      data: { isTrash: false, trashedAt: null },
    });

    return { message: 'Folder and contents restored from trash', folderId };
  }

  async permanentDelete(userId: string, folderId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, userId, isTrash: true },
    });

    if (!folder) {
      throw new NotFoundException('Trashed folder not found');
    }

    const descendantFolderIds = await this.getAllDescendantFolderIds(userId, folderId, true);
    const allFolderIds = [folderId, ...descendantFolderIds];

    // Find all files in these folders to purge physical storage and reduce user quota
    const files = await this.prisma.file.findMany({
      where: { folderId: { in: allFolderIds }, userId },
    });

    let totalPurgedBytes = BigInt(0);
    for (const f of files) {
      try {
        await this.storageService.deleteFile(f.storageKey);
      } catch (err: any) {
        this.logger.warn(`Could not delete storage file ${f.storageKey}: ${err.message}`);
      }
      totalPurgedBytes += f.size;
    }

    // Delete files in DB
    await this.prisma.file.deleteMany({
      where: { folderId: { in: allFolderIds }, userId },
    });

    // Delete folders in DB
    await this.prisma.folder.deleteMany({
      where: { id: { in: allFolderIds }, userId },
    });

    // Decrement user storage
    if (totalPurgedBytes > BigInt(0)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          usedStorage: {
            decrement: totalPurgedBytes,
          },
        },
      });
    }

    return { message: 'Folder and all enclosed files permanently deleted' };
  }

  private async getAllDescendantFolderIds(userId: string, parentId: string, isTrash = false): Promise<string[]> {
    const children = await this.prisma.folder.findMany({
      where: { parentId, userId },
      select: { id: true },
    });

    const result: string[] = [];
    for (const child of children) {
      result.push(child.id);
      const subChildren = await this.getAllDescendantFolderIds(userId, child.id, isTrash);
      result.push(...subChildren);
    }

    return result;
  }
}
