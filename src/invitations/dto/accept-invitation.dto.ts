import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { InvitationProducerDataDto } from './create-invitation.dto';

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ type: InvitationProducerDataDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => InvitationProducerDataDto)
  producerData?: InvitationProducerDataDto;
}
