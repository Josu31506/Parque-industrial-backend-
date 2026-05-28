import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateProducerDto {
  @ApiProperty()
  @IsString()
  userId: string;

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
