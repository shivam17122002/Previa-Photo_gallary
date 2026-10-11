import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.seedInitialAdmin();
  }

  private async seedInitialAdmin() {
    try {
      const adminEmail = process.env.ADMIN_INITIAL_EMAIL;
      const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
      const adminName = process.env.ADMIN_INITIAL_NAME || 'System Administrator';

      if (!adminEmail || !adminPassword) {
        this.logger.warn('Initial admin seeding skipped: configure ADMIN_INITIAL_EMAIL and ADMIN_INITIAL_PASSWORD.');
        return;
      }

      const existingAdmin = await this.prisma.user.findFirst({
        where: { role: Role.ADMIN },
      });

      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 12);
        await this.prisma.user.create({
          data: {
            email: adminEmail.toLowerCase().trim(),
            passwordHash: hashedPassword,
            fullName: adminName,
            role: Role.ADMIN,
            status: UserStatus.APPROVED,
            emailVerified: true,
          },
        });
        this.logger.log(`Initial admin user created: ${adminEmail}`);
      }
    } catch (err) {
      this.logger.error('Error seeding initial admin user', err);
    }
  }

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Total user count check: if first user, make admin and approved
    const totalUsers = await this.prisma.user.count();
    const isFirstUser = totalUsers === 0;

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName.trim(),
        role: isFirstUser ? Role.ADMIN : Role.USER,
        status: isFirstUser ? UserStatus.APPROVED : UserStatus.PENDING,
        emailVerified: isFirstUser,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    // Record audit log
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTERED',
        resource: 'User',
        details: { email: user.email, status: user.status },
        ipAddress,
        userAgent,
      },
    });

    return {
      message:
        user.status === UserStatus.APPROVED
          ? 'Account created and approved.'
          : 'Registration successful. Your account is pending administrator approval before you can log in.',
      user,
      requiresApproval: user.status === UserStatus.PENDING,
    };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check account status per PRD requirement
    if (user.status === UserStatus.PENDING) {
      throw new ForbiddenException(
        'Your registration is awaiting administrator approval. You will receive access once reviewed.',
      );
    }
    if (user.status === UserStatus.REJECTED) {
      throw new ForbiddenException(
        'Your registration request was declined by the administrator.',
      );
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Your account has been suspended by the administrator.',
      );
    }

    // Issue tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role, dto.rememberMe);

    // Save refresh token hash in DB
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    const expiresDays = dto.rememberMe ? 30 : 7;
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: refreshTokenHash,
        userId: user.id,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        resource: 'Auth',
        details: { ip: ipAddress, userAgent },
        ipAddress,
        userAgent,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatarUrl,
        storageQuota: user.storageQuota.toString(),
        usedStorage: user.usedStorage.toString(),
      },
      tokens,
    };
  }

  async refreshToken(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const payload = this.jwtService.verify(rawRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'previa_default_refresh_secret_2026',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== UserStatus.APPROVED) {
        throw new UnauthorizedException('User account invalid or not approved');
      }

      // Find active refresh tokens for this user
      const dbTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      let matchedTokenRecord = null;
      for (const t of dbTokens) {
        const matches = await bcrypt.compare(rawRefreshToken, t.tokenHash);
        if (matches) {
          matchedTokenRecord = t;
          break;
        }
      }

      if (!matchedTokenRecord) {
        throw new UnauthorizedException('Invalid or expired refresh token session');
      }

      // Revoke the old token (Token rotation)
      await this.prisma.refreshToken.update({
        where: { id: matchedTokenRecord.id },
        data: { revokedAt: new Date() },
      });

      // Issue new token pair
      const tokens = await this.generateTokens(user.id, user.email, user.role);

      const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await this.prisma.refreshToken.create({
        data: {
          tokenHash: newRefreshTokenHash,
          userId: user.id,
          expiresAt,
          ipAddress,
          userAgent,
        },
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string, rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const dbTokens = await this.prisma.refreshToken.findMany({
        where: { userId, revokedAt: null },
      });
      for (const t of dbTokens) {
        const matches = await bcrypt.compare(rawRefreshToken, t.tokenHash);
        if (matches) {
          await this.prisma.refreshToken.update({
            where: { id: t.id },
            data: { revokedAt: new Date() },
          });
          break;
        }
      }
    } else {
      // Revoke all
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Logged out successfully' };
  }

  async logoutFromRefreshToken(rawRefreshToken?: string) {
    if (!rawRefreshToken) return { message: 'Logged out successfully' };
    try {
      const payload = this.jwtService.verify<{ sub: string }>(rawRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'previa_default_refresh_secret_2026',
      });
      await this.logout(payload.sub, rawRefreshToken);
    } catch {
      // An expired or invalid token cannot represent an active session.
    }
    return { message: 'Logged out successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Current password does not match');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Invalidate all active sessions for security
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Create notification
    await this.prisma.notification.create({
      data: {
        userId,
        title: 'Security Alert: Password Changed',
        message: 'Your account password was successfully updated. All other active sessions have been signed out.',
        type: 'SECURITY_ALERT',
      },
    });

    return { message: 'Password changed successfully. Please log in again.' };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName ? dto.fullName.trim() : undefined,
        avatarUrl: dto.avatarUrl,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        avatarUrl: true,
        storageQuota: true,
        usedStorage: true,
      },
    });

    return {
      message: 'Profile updated successfully',
      user: {
        ...user,
        storageQuota: user.storageQuota.toString(),
        usedStorage: user.usedStorage.toString(),
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      storageQuota: user.storageQuota.toString(),
      usedStorage: user.usedStorage.toString(),
    };
  }

  private async generateTokens(userId: string, email: string, role: string, rememberMe = false) {
    const payload = { sub: userId, email, role };

    const accessExpiration = process.env.JWT_ACCESS_EXPIRATION || '15m';
    const refreshExpiration = rememberMe ? '30d' : (process.env.JWT_REFRESH_EXPIRATION || '7d');

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'previa_default_access_secret_2026',
      expiresIn: accessExpiration,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'previa_default_refresh_secret_2026',
      expiresIn: refreshExpiration,
    });

    return { accessToken, refreshToken };
  }
}
