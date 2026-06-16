import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsIn, IsString } from 'class-validator';

export class InvitationProducerDataDto {
  @ApiProperty()
  @IsString()
  businessName: string;

  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  location: string;

  @ApiProperty()
  @IsString()
  description: string;
}

export class CreateInvitationDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ enum: [Role.SELLER, Role.ADVISOR, Role.ADMIN] })
  @IsIn([Role.SELLER, Role.ADVISOR, Role.ADMIN])
  role: Role;
}
