import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, UserStatus } from '@prisma/client';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateQuotaDto } from './dto/update-quota.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async listUsers(
    @Query('status') status?: UserStatus,
    @Query('search') search?: string,
  ) {
    return this.adminService.listUsers(status, search);
  }

  @Post('users/:id/approve')
  async approveUser(
    @CurrentUser('id') adminId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.adminService.approveUser(adminId, targetUserId);
  }

  @Post('users/:id/reject')
  async rejectUser(
    @CurrentUser('id') adminId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.adminService.rejectUser(adminId, targetUserId);
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @CurrentUser('id') adminId: string,
    @Param('id') targetUserId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.adminService.updateUserRole(adminId, targetUserId, dto.role);
  }

  @Patch('users/:id/quota')
  async updateUserQuota(
    @CurrentUser('id') adminId: string,
    @Param('id') targetUserId: string,
    @Body() dto: UpdateQuotaDto,
  ) {
    return this.adminService.updateUserQuota(adminId, targetUserId, dto.quotaBytes);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getPlatformStats();
  }
}
