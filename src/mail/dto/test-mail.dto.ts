import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class TestMailDto {
  @ApiProperty({ example: 'correo_de_prueba@gmail.com' })
  @IsEmail()
  to: string;
}
