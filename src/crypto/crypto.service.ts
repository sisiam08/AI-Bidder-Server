import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_BYTE_LENGTH = 32;

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);

  

  encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64url'),
      authTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const key = this.getKey();
    const [ivB64, authTagB64, ciphertextB64] = payload.split('.');
    if (!ivB64 || !authTagB64 || !ciphertextB64) {
      throw new Error('Invalid encrypted payload format');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64url')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  private getKey(): Buffer {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        "ENCRYPTION_KEY is not configured. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    const key = Buffer.from(raw, 'hex');
    if (key.length !== KEY_BYTE_LENGTH) {
      throw new Error(
        `ENCRYPTION_KEY must be a ${KEY_BYTE_LENGTH}-byte hex string (${KEY_BYTE_LENGTH * 2} hex chars)`,
      );
    }
    return key;
  }
}
