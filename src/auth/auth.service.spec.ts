import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('rechaza login de usuario inexistente', async () => {
    const service = new AuthService(
      { user: { findUnique: jest.fn().mockResolvedValue(null) } } as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    await expect(service.login({ email: 'no@demo.com', password: 'Password123' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
