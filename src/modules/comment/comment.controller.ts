import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CommentService } from './comment.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Comments')
@ApiBearerAuth('access-token')
@Controller()
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post('posts/:postId/comments')
  @ApiOperation({ summary: 'Add a comment (or reply) to a post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  async create(
    @Param('postId') postId: string,
    @CurrentUser('_id') userId: string,
    @Body() dto: CreateCommentDto,
  ) {
    const comment = await this.commentService.create(postId, userId.toString(), dto);
    return { message: 'Comment created', data: comment };
  }

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'Get root comments for a post (paginated)' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  async findByPost(
    @Param('postId') postId: string,
    @Query() query: PaginationDto,
  ) {
    const result = await this.commentService.findByPost(postId, query);
    return { data: result };
  }

  @Get('comments/:id/replies')
  @ApiOperation({ summary: 'Get replies for a comment' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  async findReplies(
    @Param('id') id: string,
    @Query() query: PaginationDto,
  ) {
    const result = await this.commentService.findReplies(id, query);
    return { data: result };
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: 'Update my comment' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  async update(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    const comment = await this.commentService.update(id, userId.toString(), dto);
    return { message: 'Comment updated', data: comment };
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete my comment (soft delete)' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
  ) {
    await this.commentService.remove(id, userId.toString());
    return { message: 'Comment deleted' };
  }
}
