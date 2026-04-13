import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'quan@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
