import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SalesService } from './sales.service';
import { EarningsQueryDto } from './dto/earnings-query.dto';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SELLER, Role.ADMIN)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('my')
  my(@CurrentUser() user: { sub: string; role: string }, @Query() query: SmallPaginationQueryDto) {
    return this.salesService.findMySales(user.sub, user.role, query);
  }

  @Roles(Role.SELLER)
  @Get('earnings')
  earnings(@CurrentUser() user: { sub: string }, @Query() query: EarningsQueryDto) {
    return this.salesService.findMyEarnings(user.sub, query.month, query);
  }

  @Get(':id')
  one(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.salesService.findOne(id, user.sub, user.role);
  }

  @Patch(':id/in-preparation')
  inPreparation(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.salesService.markInPreparation(id, user.sub, user.role);
  }

  @Patch(':id/ready-for-dispatch')
  ready(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.salesService.markReadyForDispatch(id, user.sub, user.role);
  }

  @Patch(':id/dispatched')
  dispatched(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.salesService.markDispatched(id, user.sub, user.role);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/delivered')
  delivered(@Param('id') id: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.salesService.markDelivered(id, user.sub, user.role);
  }
}
