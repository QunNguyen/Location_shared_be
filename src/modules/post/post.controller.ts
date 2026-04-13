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
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostDto } from './dto/query-post.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Posts')
@ApiBearerAuth('access-token')
@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new travel location post' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        locationName: { type: 'string' },
        'location.longitude': { type: 'number' },
        'location.latitude': { type: 'number' },
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['title', 'description', 'location.longitude', 'location.latitude'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('images', 10, { storage: memoryStorage() }),
  )
  async create(
    @CurrentUser('_id') userId: string,
    @Body() dto: CreatePostDto,
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
    const post = await this.postService.create(userId.toString(), dto, uploadFiles);
    return { message: 'Post created', data: post };
  }

  @Get()
  @ApiOperation({ summary: 'Get all posts with pagination, filter, full-text & geo search' })
  async findAll(@Query() query: QueryPostDto) {
    const result = await this.postService.findAll(query);
    return { data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single post by ID' })
  @ApiParam({ name: 'id', description: 'Post ID' })
  async findOne(@Param('id') id: string) {
    const post = await this.postService.findById(id);
    return { data: post };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a post (author only)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('images', 10, { storage: memoryStorage() }),
  )
  async update(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdatePostDto,
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
    const post = await this.postService.update(id, userId.toString(), dto, uploadFiles);
    return { message: 'Post updated', data: post };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a post (author only)' })
  @ApiParam({ name: 'id', description: 'Post ID' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
  ) {
    await this.postService.remove(id, userId.toString());
    return { message: 'Post deleted' };
  }
}
