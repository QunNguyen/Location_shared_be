import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  MaxLength,
  IsNumber,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LocationDto {
  @ApiProperty({ example: 106.6602 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: 10.7769 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;
}

export class CreatePostDto {
  @ApiProperty({ example: 'Bến Ninh Kiều - Cần Thơ' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Một địa điểm check-in nổi tiếng tại Cần Thơ...' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  description: string;

  @ApiPropertyOptional({ type: [String], example: ['travel', 'cantho'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  tags?: string[];

  @ApiProperty()
  @IsNotEmpty()
  @Type(() => LocationDto)
  location: LocationDto;

  @ApiPropertyOptional({ example: 'Bến Ninh Kiều, Cần Thơ' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string;
}
