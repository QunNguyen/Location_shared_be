import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsArray,
  IsMongoId,
  IsOptional,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

export enum CreateConversationType {
  PRIVATE = 'private',
  GROUP = 'group',
}

export class CreateConversationDto {
  @ApiProperty({ enum: CreateConversationType })
  @IsNotEmpty()
  @IsEnum(CreateConversationType)
  type: CreateConversationType;

  @ApiProperty({
    type: [String],
    description: 'Member user IDs (for private: 1 ID; for group: 2+ IDs)',
    example: ['userId1', 'userId2'],
  })
  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  memberIds: string[];

  @ApiPropertyOptional({ description: 'Group name (required for group type)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class UpdateGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class AddMembersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  memberIds: string[];
}

export class RemoveMemberDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  memberId: string;
}
