import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ReviewService } from './review.service';
import { CreateReviewDto, UpdateReviewDto } from './dto/review.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Reviews')
@ApiBearerAuth('access-token')
@Controller()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('posts/:postId/reviews')
  @ApiOperation({ summary: 'Create a review for a post (once per user)' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @UseInterceptors(FilesInterceptor('images', 5, { storage: memoryStorage() }))
  async create(
    @Param('postId') postId: string,
    @CurrentUser('_id') userId: string,
    @Body() dto: CreateReviewDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const uploadFiles = (files || []).map((f) => ({
      fieldname: f.fieldname,
      originalname: f.originalname,
      encoding: f.encoding,
      mimetype: f.mimetype,
      buffer: f.buffer,
      size: f.size,
    }));
    const review = await this.reviewService.create(
      postId,
      userId.toString(),
      dto,
      uploadFiles,
    );
    return { message: 'Review created', data: review };
  }

  @Get('posts/:postId/reviews')
  @ApiOperation({ summary: 'Get reviews for a post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  async findByPost(
    @Param('postId') postId: string,
    @Query() query: PaginationDto,
  ) {
    const result = await this.reviewService.findByPost(postId, query);
    return { data: result };
  }

  @Patch('reviews/:id')
  @ApiOperation({ summary: 'Update my review' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  async update(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    const review = await this.reviewService.update(id, userId.toString(), dto);
    return { message: 'Review updated', data: review };
  }

  @Delete('reviews/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete my review' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
  ) {
    await this.reviewService.remove(id, userId.toString());
    return { message: 'Review deleted' };
  }
}
