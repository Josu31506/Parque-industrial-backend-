import { ConfigService } from '@nestjs/config';

export function getJwtSecret(config: ConfigService) {
  const secret = config.get<string>('JWT_SECRET')?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en produccion.');
  }

  return 'dev-secret';
}
