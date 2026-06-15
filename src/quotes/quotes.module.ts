import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [NotificationsModule, MailModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
