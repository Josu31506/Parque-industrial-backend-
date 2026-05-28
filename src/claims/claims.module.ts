import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
