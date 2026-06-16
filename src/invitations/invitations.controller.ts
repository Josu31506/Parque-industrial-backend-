import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateInvitationDto) {
    return this.invitationsService.create(user.sub, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  findAll() {
    return this.invitationsService.findAll();
  }

  @Get('validate/:token')
  validate(@Param('token') token: string) {
    return this.invitationsService.validate(token);
  }

  @Post('accept')
  accept(@Body() dto: AcceptInvitationDto) {
    return this.invitationsService.accept(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.invitationsService.cancel(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/resend')
  resend(@Param('id') id: string) {
    return this.invitationsService.resend(id);
  }
}
