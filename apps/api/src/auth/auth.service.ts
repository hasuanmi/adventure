import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { AUTH_REASON, PublicUser, UserRole } from '@huahua/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { REFRESH_TTL_MS } from './auth.constants';
import { LoginDto, RegisterDto } from './dto';
import { JwtPayload } from './jwt-payload.interface';

const scrypt = promisify(_scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

function toPublicUser(u: {
  id: string;
  username: string;
  role: string;
  familyId: string | null;
}): PublicUser {
  return { id: u.id, username: u.username, role: u.role as UserRole, familyId: u.familyId };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ---- 密码（scrypt，无原生依赖）----
  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    return `${salt}:${hash}`;
  }

  private async verifyPassword(password: string, stored: string): Promise<boolean> {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const calc = (await scrypt(password, salt, 64)).toString('hex');
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'));
  }

  // ---- 签发 ----
  private async signAccessToken(userId: string, role: UserRole): Promise<string> {
    return this.jwt.signAsync({ sub: userId, role } satisfies JwtPayload, { jwtid: randomUUID() });
  }

  private async issueRefreshToken(userId: string, meta: RequestMeta): Promise<string> {
    const token = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return token;
  }

  // ---- 业务 ----
  async register(dto: RegisterDto): Promise<PublicUser> {
    const username = dto.username.trim();
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) {
      throw new ConflictException({ error: 'conflict', reason: AUTH_REASON.USERNAME_TAKEN });
    }
    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash: await this.hashPassword(dto.password),
        role: dto.role ?? 'child',
      },
    });
    return toPublicUser(user);
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username.trim() } });
    if (!user || !(await this.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({
        error: 'unauthorized',
        reason: AUTH_REASON.INVALID_CREDENTIALS,
      });
    }
    const accessToken = await this.signAccessToken(user.id, user.role as UserRole);
    const refreshToken = await this.issueRefreshToken(user.id, meta);
    return { accessToken, refreshToken, user: toPublicUser(user) };
  }

  /** 轮换：消费旧 token → 签发新 token（同 family）；重放 → 全族撤销 */
  async refresh(
    rawToken: string,
    meta: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = sha256Hex(rawToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record) {
      throw new UnauthorizedException({ error: 'unauthorized', reason: AUTH_REASON.REFRESH_INVALID });
    }
    if (record.revokedAt) {
      throw new UnauthorizedException({ error: 'unauthorized', reason: AUTH_REASON.REFRESH_INVALID });
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({ error: 'unauthorized', reason: AUTH_REASON.REFRESH_EXPIRED });
    }
    if (record.usedAt) {
      // 重放检测：撤销整个 token 族
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({ error: 'unauthorized', reason: AUTH_REASON.REFRESH_REUSED });
    }

    const newToken = generateRefreshToken();
    const newHash = sha256Hex(newToken);
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { usedAt: new Date(), replacedByTokenHash: newHash },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: newHash,
          familyId: record.familyId,
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      }),
    ]);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
    const accessToken = await this.signAccessToken(user.id, user.role as UserRole);
    return { accessToken, refreshToken: newToken };
  }

  /** 撤销（幂等）：单 token 或全撤 */
  async revoke(rawToken: string, all: boolean): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256Hex(rawToken) } });
    if (!record) return;
    if (all) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toPublicUser(user);
  }
}
