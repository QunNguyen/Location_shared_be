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
import { ChatService } from './chat.service';
import {
  CreateConversationDto,
  UpdateGroupDto,
  AddMembersDto,
  RemoveMemberDto,
  CreateConversationType,
} from './dto/conversation.dto';
import { SendMessageDto, QueryMessageDto } from './dto/message.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ─── Conversations ────────────────────────────────────────────────────────

  @Post('conversations')
  @ApiOperation({ summary: 'Create conversation (private auto-deduplicated, or group)' })
  async createConversation(
    @CurrentUser('_id') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    let conversation;
    if (dto.type === CreateConversationType.PRIVATE) {
      if (dto.memberIds.length !== 1) {
        return { message: 'Private conversation requires exactly 1 target member', data: null };
      }
      conversation = await this.chatService.createOrGetPrivateConversation(
        userId.toString(),
        dto.memberIds[0],
      );
    } else {
      conversation = await this.chatService.createGroupConversation(
        userId.toString(),
        dto,
      );
    }
    return { message: 'Conversation ready', data: conversation };
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get my conversations list (with unread counts)' })
  async getMyConversations(
    @CurrentUser('_id') userId: string,
    @Query() query: PaginationDto,
  ) {
    const result = await this.chatService.getUserConversations(userId.toString(), query);
    return { data: result };
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get a conversation detail' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  async getConversation(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
  ) {
    const conv = await this.chatService.getConversation(id, userId.toString());
    return { data: conv };
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Update group name (admin only)' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  async updateGroup(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    const conv = await this.chatService.updateGroup(id, userId.toString(), dto);
    return { message: 'Group updated', data: conv };
  }

  @Post('conversations/:id/members')
  @ApiOperation({ summary: 'Add members to group' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  async addMembers(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @Body() dto: AddMembersDto,
  ) {
    const conv = await this.chatService.addMembers(id, userId.toString(), dto);
    return { message: 'Members added', data: conv };
  }

  @Delete('conversations/:id/members/:memberId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove member from group (admin only)' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiParam({ name: 'memberId', description: 'Member user ID to remove' })
  async removeMember(
    @Param('id') conversationId: string,
    @Param('memberId') memberId: string,
    @CurrentUser('_id') userId: string,
  ) {
    const conv = await this.chatService.removeMember(
      conversationId,
      userId.toString(),
      memberId,
    );
    return { message: 'Member removed', data: conv };
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  @Post('messages')
  @ApiOperation({ summary: 'Send a message with optional file attachments (REST fallback)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('attachments', 10, { storage: memoryStorage() }))
  async sendMessage(
    @CurrentUser('_id') userId: string,
    @Body() dto: SendMessageDto,
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
    const message = await this.chatService.sendMessage(userId.toString(), dto, uploadFiles);
    return { message: 'Message sent', data: message };
  }

  @Get('messages')
  @ApiOperation({ summary: 'Get message history (paginated, newest first)' })
  async getMessages(
    @CurrentUser('_id') userId: string,
    @Query() query: QueryMessageDto,
  ) {
    const result = await this.chatService.getMessages(userId.toString(), query);
    return { data: result };
  }

  @Patch('messages/:id/recall')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recall a message (sender only)' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  async recallMessage(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
  ) {
    const message = await this.chatService.recallMessage(id, userId.toString());
    return { message: 'Message recalled', data: message };
  }

  @Patch('messages/:id')
  @ApiOperation({ summary: 'Edit a message content (sender only)' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  async editMessage(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @Body() dto: { content: string },
  ) {
    const message = await this.chatService.editMessage(id, userId.toString(), dto);
    return { message: 'Message updated', data: message };
  }

  @Post('conversations/:id/seen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all messages in a conversation as seen' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  async seenMessage(
    @Param('id') conversationId: string,
    @CurrentUser('_id') userId: string,
  ) {
    await this.chatService.seenMessage(conversationId, userId.toString());
    return { message: 'Messages marked as seen' };
  }
}
