import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ConfirmPurchaseRequestGroupDto } from './dto/confirm-purchase-request-group.dto';
import { PayPurchaseRequestDto } from './dto/pay-purchase-request.dto';
import { RejectPurchaseRequestGroupDto } from './dto/reject-purchase-request-group.dto';
import { PurchaseRequestsService } from './purchase-requests.service';

@ApiTags('purchase-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-requests')
export class PurchaseRequestsController {
  constructor(private readonly service: PurchaseRequestsService) {}

  @Roles(Role.CLIENT)
  @Post()
  create(@CurrentUser() user: { sub: string }) {
    return this.service.createFromCart(user.sub);
  }

  @Roles(Role.CLIENT)
  @Get('my')
  my(@CurrentUser() user: { sub: string }) {
    return this.service.findMy(user.sub);
  }

  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @Get(':id')
  one(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.service.findOne(id, user);
  }

  @Roles(Role.CLIENT)
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: { sub: string }) {
    return this.service.cancel(id, user.sub);
  }

  @Roles(Role.CLIENT)
  @Patch(':id/continue-confirmed')
  continueConfirmed(@Param('id') id: string, @CurrentUser() user: { sub: string }) {
    return this.service.continueConfirmed(id, user.sub);
  }

  @Roles(Role.SELLER)
  @Patch('groups/:groupId/confirm')
  confirmGroup(@Param('groupId') groupId: string, @CurrentUser() user: { sub: string }, @Body() dto: ConfirmPurchaseRequestGroupDto) {
    return this.service.confirmGroup(groupId, user.sub, dto);
  }

  @Roles(Role.SELLER)
  @Patch('groups/:groupId/reject')
  rejectGroup(@Param('groupId') groupId: string, @CurrentUser() user: { sub: string }, @Body() dto: RejectPurchaseRequestGroupDto) {
    return this.service.rejectGroup(groupId, user.sub, dto);
  }

  @Roles(Role.CLIENT)
  @Post(':id/pay')
  pay(@Param('id') id: string, @CurrentUser() user: { sub: string }, @Body() dto: PayPurchaseRequestDto) {
    return this.service.pay(id, user.sub, dto);
  }
}
