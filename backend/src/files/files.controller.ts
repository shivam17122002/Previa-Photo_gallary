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
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
  Headers,
  ParseBoolPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { InitChunkDto } from './dto/init-chunk.dto';
import { CompleteChunkDto } from './dto/complete-chunk.dto';
import { RenameFileDto } from './dto/rename-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../common/guards/active-user.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request, Response } from 'express';

@Controller('files')
@UseGuards(JwtAuthGuard, ActiveUserGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('dashboard')
  async getDashboard(@CurrentUser('id') userId: string) {
    return this.filesService.getDashboardStats(userId);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } })) // 100MB direct limit
  async uploadSingle(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
  ) {
    return this.filesService.uploadSingle(userId, file, folderId);
  }

  @Post('chunk/init')
  async initChunk(
    @CurrentUser('id') userId: string,
    @Body() dto: InitChunkDto,
  ) {
    return this.filesService.initChunkUpload(userId, dto);
  }

  @Post('chunk/upload-part')
  @UseInterceptors(FileInterceptor('chunk', { limits: { fileSize: 20 * 1024 * 1024 } })) // 20MB per chunk part
  async uploadChunkPart(
    @CurrentUser('id') userId: string,
    @Body('sessionId') sessionId: string,
    @Body('partNumber') partNumber: string,
    @UploadedFile() chunk: Express.Multer.File,
  ) {
    return this.filesService.uploadChunkPart(
      userId,
      sessionId,
      parseInt(partNumber, 10),
      chunk,
    );
  }

  @Post('chunk/complete')
  async completeChunk(
    @CurrentUser('id') userId: string,
    @Body() dto: CompleteChunkDto,
  ) {
    return this.filesService.completeChunkUpload(userId, dto);
  }

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query('folderId') folderId?: string,
    @Query('search') search?: string,
    @Query('isFavorite') isFavorite?: string,
    @Query('isTrash') isTrash?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'asc' | 'desc',
    @Query('all') all?: string,
  ) {
    return this.filesService.list(userId, {
      folderId,
      search,
      isFavorite: isFavorite === 'true' ? true : isFavorite === 'false' ? false : undefined,
      isTrash: isTrash === 'true',
      category,
      sortBy,
      order,
      all: all === 'true',
    });
  }

  @Delete('trash/empty')
  async emptyTrash(@CurrentUser('id') userId: string) {
    return this.filesService.emptyTrash(userId);
  }

  @Get(':id')
  async getById(
    @CurrentUser('id') userId: string,
    @Param('id') fileId: string,
  ) {
    return this.filesService.getById(userId, fileId);
  }

  @Get(':id/stream')
  async streamFile(
    @CurrentUser('id') userId: string,
    @Param('id') fileId: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    let parsedRange: { start: number; end: number } | undefined = undefined;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : NaN;
      parsedRange = { start, end };
    }

    const result = await this.filesService.getFileStream(userId, fileId, parsedRange);

    res.status(result.statusCode || 200);
    res.setHeader('Content-Type', result.mimeType || result.contentType);
    res.setHeader('Content-Length', result.contentLength);
    res.setHeader('Accept-Ranges', 'bytes');

    if (result.contentRange) {
      res.setHeader('Content-Range', result.contentRange);
    }

    // Inline preview disposition
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(result.filename)}"`,
    );

    result.stream.pipe(res);
  }

  @Get(':id/download')
  async downloadFile(
    @CurrentUser('id') userId: string,
    @Param('id') fileId: string,
    @Res() res: Response,
  ) {
    const result = await this.filesService.getFileStream(userId, fileId);

    res.status(200);
    res.setHeader('Content-Type', result.mimeType || result.contentType);
    res.setHeader('Content-Length', result.contentLength);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.filename)}"`,
    );

    result.stream.pipe(res);
  }

  @Patch(':id/rename')
  async rename(
    @CurrentUser('id') userId: string,
    @Param('id') fileId: string,
    @Body() dto: RenameFileDto,
  ) {
    return this.filesService.rename(userId, fileId, dto);
  }

  @Patch(':id/move')
  async move(
    @CurrentUser('id') userId: string,
    @Param('id') fileId: string,
    @Body() dto: MoveFileDto,
  ) {
    return this.filesService.move(userId, fileId, dto);
  }

  @Post(':id/favorite')
  async toggleFavorite(
    @CurrentUser('id') userId: string,
    @Param('id') fileId: string,
  ) {
    return this.filesService.toggleFavorite(userId, fileId);
  }

  @Delete(':id')
  async softDelete(
    @CurrentUser('id') userId: string,
    @Param('id') fileId: string,
  ) {
    return this.filesService.softDelete(userId, fileId);
  }

  @Post(':id/restore')
  async restore(
    @CurrentUser('id') userId: string,
    @Param('id') fileId: string,
  ) {
    return this.filesService.restore(userId, fileId);
  }

  @Delete(':id/permanent')
  async permanentDelete(
    @CurrentUser('id') userId: string,
    @Param('id') fileId: string,
  ) {
    return this.filesService.permanentDelete(userId, fileId);
  }
}
