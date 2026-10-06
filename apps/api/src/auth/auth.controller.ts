import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AUTH_CHANNEL_HEADER, AUTH_CHANNEL_MOBILE, AUTH_REASON } from '@huahua/shared-types';
import { CookieOptions, Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { REFRESH_COOKIE_NAME, REFRESH_TTL_MS } from './auth.constants';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from './jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto) {
    return { user: await this.auth.register(dto) };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, user } = await this.auth.login(dto, this.meta(req));
    return this.tokenResponse(res, req, { accessToken, refreshToken, user });
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = this.extractRefreshToken(req);
    const { accessToken, refreshToken } = await this.auth.refresh(raw, this.meta(req));
    return this.tokenResponse(res, req, { accessToken, refreshToken });
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = this.extractRefreshToken(req);
    if (raw) {
      await this.auth.revoke(raw, req.query.all === 'true');
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() payload: JwtPayload) {
    return { user: await this.auth.me(payload.sub) };
  }

  // ---- 通道与 Cookie 工具 ----
  /** Mobile（X-Auth-Channel: mobile）→ body 返回 refreshToken、不设 Cookie；Web → 只设 Cookie */
  private tokenResponse(
    res: Response,
    req: Request,
    payload: { accessToken: string; refreshToken: string; user?: unknown },
  ): { accessToken: string; refreshToken?: string; user?: unknown } {
    if (this.isMobile(req)) {
      return { accessToken: payload.accessToken, refreshToken: payload.refreshToken, user: payload.user };
    }
    res.cookie(REFRESH_COOKIE_NAME, payload.refreshToken, this.cookieOptions());
    return { accessToken: payload.accessToken, user: payload.user };
  }

  private isMobile(req: Request): boolean {
    return req.headers[AUTH_CHANNEL_HEADER] === AUTH_CHANNEL_MOBILE;
  }

  private extractRefreshToken(req: Request): string {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
    const cookies = req.cookies as Record<string, string> | undefined;
    const cookie = cookies?.[REFRESH_COOKIE_NAME];
    if (cookie) return cookie;
    throw new UnauthorizedException({ error: 'unauthorized', reason: AUTH_REASON.MISSING_TOKEN });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TTL_MS,
    };
  }

  private meta(req: Request): { ip?: string; userAgent?: string } {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? req.ip;
    return { ip, userAgent: req.headers['user-agent']?.slice(0, 256) };
  }
}
