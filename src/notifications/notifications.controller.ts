import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: { sub: string }) {
    return this.notificationsService.listForUser(user.sub);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.sub, id);
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: { sub: string }) {
    return this.notificationsService.readAll(user.sub);
  }
}
