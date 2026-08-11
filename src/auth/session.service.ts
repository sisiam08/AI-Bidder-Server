import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service';

export const SESSION_COOKIE_NAME = 'agentic_session';

export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

interface SessionPayload {
  sub: string;
  ver: number;
  iat: number;
}

@Injectable()
export class SessionService {
  constructor(private readonly crypto: CryptoService) {}

  create(user: { id: string; sessionVersion: number }): string {
    const payload: SessionPayload = {
      sub: user.id,
      ver: user.sessionVersion,
      iat: Math.floor(Date.now() / 1000),
    };
    return this.crypto.encrypt(JSON.stringify(payload));
  }

  verify(token: string): SessionPayload {
    try {
      const plaintext = this.crypto.decrypt(token);
      const parsed = JSON.parse(plaintext) as Partial<SessionPayload>;
      if (typeof parsed.sub !== 'string' || typeof parsed.ver !== 'number') {
        throw new Error('Malformed session payload');
      }
      const iat = parsed.iat ?? Math.floor(Date.now() / 1000);
      const ageMs = Date.now() - iat * 1000;
      if (ageMs > SESSION_MAX_AGE_MS) {
        throw new Error('Session expired');
      }
      return { sub: parsed.sub, ver: parsed.ver, iat };
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
  }
}
