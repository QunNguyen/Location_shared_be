import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsMongoId,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class SendMessageDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  conversationId: string;

  @ApiPropertyOptional({ example: 'Xin chào!' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({ description: 'Quoted/reply-to message ID' })
  @IsOptional()
  @IsMongoId()
  replyTo?: string;
}

export class EditMessageDto {
  @ApiProperty({ example: 'Nội dung đã chỉnh sửa' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  content: string;
}

export class QueryMessageDto extends PaginationDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsNotEmpty()
  @IsMongoId()
  conversationId: string;
}
