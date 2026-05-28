import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [NotificationsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
