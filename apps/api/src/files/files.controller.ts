import { Controller, Get, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import { FilesService, StoredFileDto, UploadedFileLike } from './files.service';

// /files（本项目新增：上传 + 鉴权读取；上游是 base64 直存 DB，见 docs/p6-fidelity-audit.md）
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() actor: RequestActor,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Query('scope') scope = 'wrong-question',
  ): Promise<StoredFileDto> {
    return this.files.save(actor, scope, file);
  }

  @Get()
  async read(
    @CurrentUser() actor: RequestActor,
    @Query('key') key: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, mime } = this.files.open(actor, key ?? '');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  }
}
