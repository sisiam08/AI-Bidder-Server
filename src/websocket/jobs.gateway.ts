import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SessionService, SESSION_COOKIE_NAME } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';

function parseCookies(header?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) result[name] = value;
  }
  return result;
}

@WebSocketGateway({
  namespace: '/api/v1/ws',
  cors: { origin: true, credentials: true },
})
export class JobsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private connectedClients: Map<string, string> = new Map(); 

  constructor(
    private sessionService: SessionService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token =
      (typeof client.handshake.auth?.token === 'string' &&
        client.handshake.auth.token) ||
      (() => {
        const header = client.handshake.headers.authorization;
        if (typeof header === 'string') {
          const match = /^Bearer\s+(.+)$/i.exec(header.trim());
          if (match) return match[1];
        }
        return null;
      })() ||
      parseCookies(client.handshake.headers.cookie)[SESSION_COOKIE_NAME];
    if (!token) return;

    try {
      const payload = this.sessionService.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.sessionVersion !== payload.ver) return;
      this.connectedClients.set(client.id, user.id);
    } catch {
      return;
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
  }

  emitJobEvent(userId: string, event: string, data: unknown) {
    for (const [socketId, uid] of this.connectedClients) {
      if (uid === userId) {
        this.server.to(socketId).emit(event, data);
      }
    }
  }
}
