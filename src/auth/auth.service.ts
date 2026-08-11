import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { SetupUserDto } from '../common/dto/setup-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  async setupUser(dto: SetupUserDto) {
    const data = {
      aiProvider: dto.aiProvider,
      encryptedAiApiKey:
        dto.aiApiKey !== undefined
          ? dto.aiApiKey
            ? this.crypto.encrypt(dto.aiApiKey)
            : null
          : undefined,
      encryptedTelegramBotToken:
        dto.telegramBotToken !== undefined
          ? dto.telegramBotToken
            ? this.crypto.encrypt(dto.telegramBotToken)
            : null
          : undefined,
      telegramChatId:
        dto.telegramChatId !== undefined
          ? dto.telegramChatId || null
          : undefined,
    };

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          ...data,
          sessionVersion: { increment: 1 },
        },
      });
    }

    return this.prisma.user.create({
      data: {
        email: dto.email,
        ...data,
        sessionVersion: 1,
      },
    });
  }
}
