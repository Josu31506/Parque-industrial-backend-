import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [MailModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
