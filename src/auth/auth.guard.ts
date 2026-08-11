import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { SessionService, SESSION_COOKIE_NAME } from './session.service';
import { PrismaService } from '../prisma/prisma.service';

interface AuthRequest {
  user?: { userId: string };
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private sessionService: SessionService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();

    const sessionUser = await this.authenticateViaSession(request);
    if (sessionUser) {
      request.user = sessionUser;
      return true;
    }

    throw new ForbiddenException('Authentication required');
  }

  private extractToken(request: AuthRequest): string | null {
    const header = request.headers?.authorization;
    if (typeof header === 'string') {
      const match = /^Bearer\s+(.+)$/i.exec(header.trim());
      if (match) return match[1];
    }
    const cookie = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof cookie === 'string' && cookie) return cookie;
    return null;
  }

  private async authenticateViaSession(request: AuthRequest) {
    const token = this.extractToken(request);
    if (token === null) {
      return null;
    }

    try {
      const payload = this.sessionService.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.sessionVersion !== payload.ver) {
        return null;
      }
      return { userId: user.id };
    } catch {
      return null;
    }
  }
}
