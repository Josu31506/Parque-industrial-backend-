import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SimulatePaymentDto } from './dto/simulate-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Roles(Role.CLIENT)
  @Post('simulate')
  simulate(@CurrentUser() user: { sub: string }, @Body() dto: SimulatePaymentDto) {
    return this.paymentsService.simulate(user.sub, dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/release')
  release(@Param('id') id: string) {
    return this.paymentsService.release(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/hold')
  hold(@Param('id') id: string) {
    return this.paymentsService.hold(id);
  }
}
