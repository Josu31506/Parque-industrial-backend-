import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClaimStatus, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ClaimsService } from './claims.service';
import { CreateClaimDto } from './dto/create-claim.dto';

@ApiTags('claims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Roles(Role.CLIENT)
  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateClaimDto) {
    return this.claimsService.create(user.sub, dto);
  }

  @Roles(Role.CLIENT)
  @Get('my')
  my(@CurrentUser() user: { sub: string }) {
    return this.claimsService.my(user.sub);
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Get()
  all() {
    return this.claimsService.findAll();
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Get(':id')
  one(@Param('id') id: string) {
    return this.claimsService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Patch(':id/in-review')
  review(@Param('id') id: string) {
    return this.claimsService.updateStatus(id, ClaimStatus.IN_REVIEW);
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Patch(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.claimsService.updateStatus(id, ClaimStatus.RESOLVED);
  }

  @Roles(Role.ADMIN, Role.ADVISOR)
  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.claimsService.updateStatus(id, ClaimStatus.REJECTED);
  }
}
