import { BadRequestException, Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TestMailDto } from './dto/test-mail.dto';
import { MailService } from './mail.service';

@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('test')
  async test(@CurrentUser() user: { role: string }, @Body() dto: TestMailDto) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && user.role !== Role.ADMIN) {
      throw new ForbiddenException('No tienes permiso para probar el envio de correos.');
    }

    try {
      const isConnected = await this.mailService.verifyConnection();
      if (!isConnected) {
        throw new Error('SMTP no disponible');
      }

      await this.mailService.sendTestEmail(dto.to);
      return { message: 'Correo de prueba enviado' };
    } catch {
      throw new BadRequestException('No se pudo enviar el correo de prueba. Revisa la configuracion SMTP.');
    }
  }
}
