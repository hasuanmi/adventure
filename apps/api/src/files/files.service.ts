import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { ReadStream } from 'node:fs';
import { FILE_REASON } from '@huahua/shared-types';
import { RequestActor } from '../auth/jwt-auth.guard';

/** 图片 mime 白名单（上游 upload-zone 仅 .jpeg/.jpg/.png；我们再放行 webp） */
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
/** 单文件上限（上游前端提示 5MB；服务端按文档允许到 10MB） */
const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StoredFileDto {
  key: string;
  url: string;
  size: number;
  mime: string;
}

/**
 * 文件存储（本项目的上传接口；上游用的是 base64 直存 DB，我们按硬基线改为磁盘 + key）。
 * 目录：``{UPLOAD_DIR}/{familyId}/{scope}/{uuid}{ext}``；读取走鉴权接口（不使用公开静态目录）。
 */
@Injectable()
export class FilesService {
  private readonly root = process.env.UPLOAD_DIR ?? '/app/uploads';

  async save(
    actor: RequestActor,
    scope: string,
    file: UploadedFileLike | undefined,
  ): Promise<StoredFileDto> {
    if (!actor.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: FILE_REASON.FAMILY_REQUIRED });
    }
    if (!file) throw new BadRequestException({ error: 'bad_request', reason: FILE_REASON.NO_FILE });
    const ext = ALLOWED_MIME[file.mimetype];
    if (!ext) throw new BadRequestException({ error: 'bad_request', reason: FILE_REASON.UNSUPPORTED_TYPE });
    if (file.size > MAX_BYTES) {
      throw new HttpException({ error: 'payload_too_large', reason: FILE_REASON.TOO_LARGE }, 413);
    }

    const safeScope = /^[a-z0-9-]{1,32}$/.test(scope) ? scope : 'misc';
    const fileName = `${randomUUID()}${ext}`;
    const dir = join(this.root, actor.familyId, safeScope);
    mkdirSync(dir, { recursive: true });
    await writeFile(join(dir, fileName), file.buffer);

    const key = `${actor.familyId}/${safeScope}/${fileName}`;
    return { key, url: `/api/files?key=${encodeURIComponent(key)}`, size: file.size, mime: file.mimetype };
  }

  /** 鉴权读取（仅同 family 可读；防止路径穿越） */
  open(actor: RequestActor, key: string): { stream: ReadStream; mime: string } {
    if (!actor.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: FILE_REASON.FAMILY_REQUIRED });
    }
    const normalized = normalize(key).replace(/\\/g, '/');
    if (normalized.includes('..') || !normalized.startsWith(`${actor.familyId}/`)) {
      throw new NotFoundException({ error: 'not_found', reason: FILE_REASON.NOT_FOUND });
    }
    const abs = join(this.root, normalized);
    if (!existsSync(abs)) {
      throw new NotFoundException({ error: 'not_found', reason: FILE_REASON.NOT_FOUND });
    }
    const mime = extname(abs) === '.png' ? 'image/png' : extname(abs) === '.webp' ? 'image/webp' : 'image/jpeg';
    return { stream: createReadStream(abs), mime };
  }
}
