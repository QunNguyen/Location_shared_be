import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  MaxLength,
  IsMongoId,
} from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Bài viết hay quá!' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ description: 'Parent comment ID for replies' })
  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

export class UpdateCommentDto {
  @ApiProperty({ example: 'Bài viết rất hay!' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  content: string;
}
