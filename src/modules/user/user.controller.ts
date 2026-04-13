import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMyProfile(@CurrentUser('_id') userId: string) {
    const user = await this.userService.getProfile(userId.toString());
    return { data: user };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.userService.updateProfile(userId.toString(), dto);
    return { message: 'Profile updated', data: user };
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload avatar (image only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @CurrentUser('_id') userId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /image\/(jpeg|png|webp|gif)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const uploadFile = {
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    };
    const user = await this.userService.uploadAvatar(userId.toString(), uploadFile);
    return { message: 'Avatar uploaded', data: { avatarUrl: user.avatarUrl } };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users by name or email' })
  async searchUsers(
    @CurrentUser('_id') userId: string,
    @Query() query: PaginationDto,
  ) {
    const result = await this.userService.searchUsers(query, userId.toString());
    return { data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async getUser(
    @Param('id') id: string,
    @CurrentUser('_id') requesterId: string,
  ) {
    const user = await this.userService.getPublicProfile(id, requesterId.toString());
    return { data: user };
  }

  @Post('block/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a user' })
  @ApiParam({ name: 'id', description: 'User ID to block' })
  async blockUser(
    @CurrentUser('_id') userId: string,
    @Param('id') targetId: string,
  ) {
    await this.userService.blockUser(userId.toString(), targetId);
    return { message: 'User blocked' };
  }

  @Delete('block/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user' })
  @ApiParam({ name: 'id', description: 'User ID to unblock' })
  async unblockUser(
    @CurrentUser('_id') userId: string,
    @Param('id') targetId: string,
  ) {
    await this.userService.unblockUser(userId.toString(), targetId);
    return { message: 'User unblocked' };
  }

  @Get('me/blocked')
  @ApiOperation({ summary: 'Get my block list' })
  async getBlockList(@CurrentUser('_id') userId: string) {
    const list = await this.userService.getBlockList(userId.toString());
    return { data: list };
  }
}
