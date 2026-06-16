import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { MailModule } from '../mail/mail.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getJwtSecret(config),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '1d',
        },
      }),
    }),
    MailModule,
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
