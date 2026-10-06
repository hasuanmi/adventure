import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AUTH_REASON } from '@huahua/shared-types';
import { JwtPayload } from './jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';

/** 经守卫写入 req.user 的请求者信息 */
export interface RequestActor extends JwtPayload {
  familyId: string | null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException({ error: 'unauthorized', reason: AUTH_REASON.MISSING_TOKEN });
    }

    try {
      const payload = (await this.jwt.verifyAsync(header.slice('Bearer '.length))) as JwtPayload;
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new Error('user_not_found');
      req.user = { sub: user.id, role: user.role, familyId: user.familyId } satisfies RequestActor;
      return true;
    } catch {
      throw new UnauthorizedException({ error: 'unauthorized', reason: AUTH_REASON.INVALID_TOKEN });
    }
  }
}
