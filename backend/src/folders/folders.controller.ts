import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { MoveFolderDto } from './dto/move-folder.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../common/guards/active-user.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('folders')
@UseGuards(JwtAuthGuard, ActiveUserGuard)
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.foldersService.create(userId, dto);
  }

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.foldersService.list(userId, parentId);
  }

  @Get('trash')
  async listTrash(@CurrentUser('id') userId: string) {
    return this.foldersService.listTrash(userId);
  }

  @Get(':id/breadcrumbs')
  async getBreadcrumbs(
    @CurrentUser('id') userId: string,
    @Param('id') folderId: string,
  ) {
    return this.foldersService.getBreadcrumbs(userId, folderId);
  }

  @Patch(':id/rename')
  async rename(
    @CurrentUser('id') userId: string,
    @Param('id') folderId: string,
    @Body() dto: RenameFolderDto,
  ) {
    return this.foldersService.rename(userId, folderId, dto);
  }

  @Patch(':id/move')
  async move(
    @CurrentUser('id') userId: string,
    @Param('id') folderId: string,
    @Body() dto: MoveFolderDto,
  ) {
    return this.foldersService.move(userId, folderId, dto);
  }

  @Delete(':id')
  async softDelete(
    @CurrentUser('id') userId: string,
    @Param('id') folderId: string,
  ) {
    return this.foldersService.softDelete(userId, folderId);
  }

  @Post(':id/restore')
  async restore(
    @CurrentUser('id') userId: string,
    @Param('id') folderId: string,
  ) {
    return this.foldersService.restore(userId, folderId);
  }

  @Delete(':id/permanent')
  async permanentDelete(
    @CurrentUser('id') userId: string,
    @Param('id') folderId: string,
  ) {
    return this.foldersService.permanentDelete(userId, folderId);
  }
}
