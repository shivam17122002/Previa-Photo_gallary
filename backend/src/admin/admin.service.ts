import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, UserStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(status?: UserStatus, search?: string) {
    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        avatarUrl: true,
        storageQuota: true,
        usedStorage: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            files: true,
            folders: true,
          },
        },
      },
    });

    return users.map((u) => ({
      ...u,
      storageQuota: u.storageQuota.toString(),
      usedStorage: u.usedStorage.toString(),
      fileCount: u._count.files,
      folderCount: u._count.folders,
    }));
  }

  async approveUser(adminId: string, targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      throw new NotFoundException('Target user not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        status: UserStatus.APPROVED,
        emailVerified: true,
      },
    });

    // Notify user
    await this.prisma.notification.create({
      data: {
        userId: targetUserId,
        title: 'Account Approved!',
        message: 'Your registration has been approved by the administrator. You now have full access to Previa.',
        type: 'ADMIN_APPROVAL',
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_APPROVE_USER',
        resource: 'User',
        details: { approvedUserId: targetUserId, email: user.email },
      },
    });

    return {
      message: `User ${user.email} approved successfully`,
      user: {
        id: updated.id,
        email: updated.email,
        status: updated.status,
      },
    };
  }

  async rejectUser(adminId: string, targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      throw new NotFoundException('Target user not found');
    }

    if (user.role === Role.ADMIN) {
      throw new BadRequestException('Cannot reject an administrator account');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { status: UserStatus.REJECTED },
    });

    // Revoke any active sessions
    await this.prisma.refreshToken.updateMany({
      where: { userId: targetUserId },
      data: { revokedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_REJECT_USER',
        resource: 'User',
        details: { rejectedUserId: targetUserId, email: user.email },
      },
    });

    return {
      message: `User ${user.email} registration rejected`,
      user: {
        id: updated.id,
        email: updated.email,
        status: updated.status,
      },
    };
  }

  async updateUserRole(adminId: string, targetUserId: string, newRole: Role) {
    if (adminId === targetUserId && newRole !== Role.ADMIN) {
      throw new BadRequestException('You cannot demote yourself from admin');
    }

    const user = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_UPDATE_ROLE',
        resource: 'User',
        details: { targetUserId, newRole },
      },
    });

    return { message: `User role updated to ${newRole}`, user };
  }

  async updateUserQuota(adminId: string, targetUserId: string, quotaBytes: number) {
    const user = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { storageQuota: BigInt(quotaBytes) },
    });

    await this.prisma.notification.create({
      data: {
        userId: targetUserId,
        title: 'Storage Quota Updated',
        message: `Your storage quota has been updated to ${(quotaBytes / (1024 * 1024 * 1024)).toFixed(2)} GB.`,
        type: 'SYSTEM',
      },
    });

    return {
      message: 'Storage quota updated',
      quota: user.storageQuota.toString(),
    };
  }

  async getPlatformStats() {
    const totalUsers = await this.prisma.user.count();
    const pendingUsers = await this.prisma.user.count({
      where: { status: UserStatus.PENDING },
    });
    const approvedUsers = await this.prisma.user.count({
      where: { status: UserStatus.APPROVED },
    });

    const totalFiles = await this.prisma.file.count({
      where: { isTrash: false },
    });
    const trashedFiles = await this.prisma.file.count({
      where: { isTrash: true },
    });
    const totalFolders = await this.prisma.folder.count({
      where: { isTrash: false },
    });

    // Sum of used storage
    const storageSum = await this.prisma.user.aggregate({
      _sum: { usedStorage: true, storageQuota: true },
    });

    // Malware scanning statistics
    const cleanFiles = await this.prisma.file.count({
      where: { scanStatus: 'CLEAN' },
    });
    const infectedFiles = await this.prisma.file.count({
      where: { scanStatus: 'INFECTED' },
    });
    const pendingScans = await this.prisma.file.count({
      where: { scanStatus: 'PENDING' },
    });

    return {
      users: {
        total: totalUsers,
        pending: pendingUsers,
        approved: approvedUsers,
      },
      files: {
        active: totalFiles,
        trashed: trashedFiles,
        totalFolders,
      },
      storage: {
        totalUsedBytes: storageSum._sum.usedStorage ? storageSum._sum.usedStorage.toString() : '0',
        totalAllocatedBytes: storageSum._sum.storageQuota ? storageSum._sum.storageQuota.toString() : '0',
      },
      scans: {
        clean: cleanFiles,
        infected: infectedFiles,
        pending: pendingScans,
      },
    };
  }
}
