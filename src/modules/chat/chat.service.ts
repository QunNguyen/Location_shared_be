import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ChatRepository } from './chat.repository';
import {
  Conversation,
  ConversationDocument,
  ConversationType,
} from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import {
  CreateConversationDto,
  UpdateGroupDto,
  AddMembersDto,
} from './dto/conversation.dto';
import { SendMessageDto, EditMessageDto, QueryMessageDto } from './dto/message.dto';
import { MinioService, UploadedFile } from '../../shared/minio/minio.service';
import { RedisService } from '../../shared/redis/redis.service';
import { KafkaProducerService, KAFKA_TOPICS } from '../../shared/kafka/kafka.producer.service';
import { UserService } from '../user/user.service';
import { paginate } from '../../common/dto/pagination.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { sanitizeObject } from '../../common/utils/sanitize.util';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private chatRepository: ChatRepository,
    private minioService: MinioService,
    private redisService: RedisService,
    private kafkaProducer: KafkaProducerService,
    private userService: UserService,
  ) {}

  // ─── Conversation ─────────────────────────────────────────────────────────

  async createOrGetPrivateConversation(
    userId: string,
    targetUserId: string,
  ): Promise<ConversationDocument> {
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot create conversation with yourself');
    }

    const blocked = await this.userService.isBlocked(userId, targetUserId);
    if (blocked) throw new ForbiddenException('Cannot message blocked user');

    const existing = await this.chatRepository.findPrivateConversation(userId, targetUserId);
    if (existing) return existing;

    const conversation = await this.chatRepository.createConversation({
      type: ConversationType.PRIVATE,
      members: [new Types.ObjectId(userId), new Types.ObjectId(targetUserId)],
      createdBy: new Types.ObjectId(userId),
      lastMessageAt: new Date(),
    });

    // Init UserConversation rows
    await Promise.all([
      this.chatRepository.upsertUserConversation(userId, conversation._id.toString(), {
        lastReadAt: new Date(),
        unreadCount: 0,
      }),
      this.chatRepository.upsertUserConversation(targetUserId, conversation._id.toString(), {
        lastReadAt: new Date(),
        unreadCount: 0,
      }),
    ]);

    return this.chatRepository.findConversationById(conversation._id.toString());
  }

  async createGroupConversation(
    userId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationDocument> {
    if (!dto.name || dto.name.trim() === '') {
      throw new BadRequestException('Group name is required');
    }
    if (dto.memberIds.length < 2) {
      throw new BadRequestException('Group needs at least 2 other members');
    }

    const allMembers = [...new Set([userId, ...dto.memberIds])];
    const memberObjectIds = allMembers.map((id) => new Types.ObjectId(id));

    const conversation = await this.chatRepository.createConversation({
      type: ConversationType.GROUP,
      members: memberObjectIds,
      name: dto.name.trim(),
      createdBy: new Types.ObjectId(userId),
      groupAdmin: new Types.ObjectId(userId),
      lastMessageAt: new Date(),
    });

    const convId = conversation._id.toString();
    await Promise.all(
      allMembers.map((memberId) =>
        this.chatRepository.upsertUserConversation(memberId, convId, {
          lastReadAt: new Date(),
          unreadCount: 0,
        }),
      ),
    );

    return this.chatRepository.findConversationById(convId);
  }

  async getConversation(conversationId: string, userId: string): Promise<ConversationDocument> {
    const isMember = await this.chatRepository.isMember(conversationId, userId);
    if (!isMember) throw new ForbiddenException('Not a member of this conversation');

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async getUserConversations(userId: string, query: PaginationDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.chatRepository.findUserConversations(userId, skip, limit),
      this.chatRepository.countUserConversations(userId),
    ]);

    // Attach unread counts from Redis
    const itemsWithUnread = await Promise.all(
      items.map(async (conv) => {
        const unread = await this.redisService.getUnreadCount(
          userId,
          conv._id.toString(),
        );
        return { ...conv, unreadCount: unread };
      }),
    );

    return paginate(itemsWithUnread, total, page, limit);
  }

  async updateGroup(
    conversationId: string,
    userId: string,
    dto: UpdateGroupDto,
  ): Promise<ConversationDocument> {
    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Not a group conversation');
    }
    if (conversation.groupAdmin.toString() !== userId) {
      throw new ForbiddenException('Only admin can update group');
    }

    return this.chatRepository.updateConversation(conversationId, {
      name: dto.name,
    } as any);
  }

  async addMembers(
    conversationId: string,
    userId: string,
    dto: AddMembersDto,
  ): Promise<ConversationDocument> {
    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Only groups can add members');
    }

    const memberObjectIds = dto.memberIds.map((id) => new Types.ObjectId(id));
    await this.chatRepository.addMembersToConversation(conversationId, memberObjectIds);

    await Promise.all(
      dto.memberIds.map((memberId) =>
        this.chatRepository.upsertUserConversation(memberId, conversationId, {
          lastReadAt: new Date(),
          unreadCount: 0,
        }),
      ),
    );

    return this.chatRepository.findConversationById(conversationId);
  }

  async removeMember(
    conversationId: string,
    adminId: string,
    memberId: string,
  ): Promise<ConversationDocument> {
    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Not a group conversation');
    }
    if (conversation.groupAdmin.toString() !== adminId) {
      throw new ForbiddenException('Only admin can remove members');
    }
    if (memberId === adminId) {
      throw new BadRequestException('Admin cannot remove themselves');
    }

    await this.chatRepository.removeMemberFromConversation(conversationId, memberId);
    return this.chatRepository.findConversationById(conversationId);
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  async sendMessage(
    userId: string,
    dto: SendMessageDto,
    files?: UploadedFile[],
  ): Promise<MessageDocument> {
    const { conversationId, content, replyTo } = dto;

    const isMember = await this.chatRepository.isMember(conversationId, userId);
    if (!isMember) throw new ForbiddenException('Not a member of this conversation');

    if (!content && (!files || files.length === 0)) {
      throw new BadRequestException('Message must have content or attachments');
    }

    const sanitizedContent = content ? sanitizeObject(content) : null;

    let attachments: any[] = [];
    if (files?.length) {
      const results = await this.minioService.uploadMultiple(files, 'chat');
      attachments = results.map((r) => ({
        url: r.url,
        key: r.key,
        type: r.mimetype,
        name: r.originalName,
        size: r.size,
      }));
    }

    const messageData: Partial<Message> = {
      conversationId: new Types.ObjectId(conversationId),
      senderId: new Types.ObjectId(userId),
      content: sanitizedContent,
      attachments,
      replyTo: replyTo ? new Types.ObjectId(replyTo) : null,
    };

    const message = await this.chatRepository.createMessage(messageData);

    // Update last message on conversation
    await this.chatRepository.updateConversationLastMessage(conversationId, message);

    // Increment unread counts for other members in Redis
    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (conversation) {
      const memberIds = conversation.members.map((m: any) =>
        m._id ? m._id.toString() : m.toString(),
      );
      await Promise.all(
        memberIds
          .filter((id) => id !== userId)
          .map((memberId) =>
            this.redisService.incrementUnread(memberId, conversationId),
          ),
      );

      // Also increment in MongoDB
      await this.chatRepository.incrementUnreadForMembers(
        conversationId,
        userId,
        memberIds,
      );

      // Send Kafka notification for offline users
      const offlineUsers = await this.getOfflineMembers(memberIds, userId);
      for (const offlineUserId of offlineUsers) {
        await this.kafkaProducer.send({
          topic: KAFKA_TOPICS.MESSAGE_NOTIFICATION,
          key: offlineUserId,
          value: {
            userId: offlineUserId,
            senderId: userId,
            conversationId,
            messagePreview: sanitizedContent || '📎 Attachment',
            conversationType: conversation.type,
            conversationName: conversation.name,
          },
        }).catch((err) => this.logger.error('Kafka notification error', err.message));
      }
    }

    return this.chatRepository.findMessageById(message._id.toString());
  }

  async getMessages(userId: string, query: QueryMessageDto) {
    const { conversationId, page = 1, limit = 30 } = query;
    const skip = (page - 1) * limit;

    const isMember = await this.chatRepository.isMember(conversationId, userId);
    if (!isMember) throw new ForbiddenException('Not a member of this conversation');

    const [items, total] = await Promise.all([
      this.chatRepository.findMessages(conversationId, skip, limit),
      this.chatRepository.countMessages(conversationId),
    ]);

    return paginate(items, total, page, limit);
  }

  async editMessage(
    messageId: string,
    userId: string,
    dto: EditMessageDto,
  ): Promise<MessageDocument> {
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException('Not your message');
    }
    if (message.isRecalled) throw new BadRequestException('Cannot edit recalled message');

    const sanitizedContent = sanitizeObject(dto.content);
    const updated = await this.chatRepository.updateMessage(messageId, {
      content: sanitizedContent,
      isEdited: true,
    });

    return updated;
  }

  async recallMessage(messageId: string, userId: string): Promise<MessageDocument> {
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException('Only sender can recall message');
    }
    if (message.isRecalled) throw new BadRequestException('Message already recalled');

    const updated = await this.chatRepository.updateMessage(messageId, {
      isRecalled: true,
      content: null,
    });

    // Update last message preview if it was the last one
    const conversation = await this.chatRepository.findConversationById(
      message.conversationId.toString(),
    );
    if (conversation?.lastMessageId?.toString() === messageId) {
      await this.chatRepository.updateConversation(
        message.conversationId.toString(),
        { lastMessage: '[Message recalled]' } as any,
      );
    }

    return updated;
  }

  async seenMessage(conversationId: string, userId: string): Promise<void> {
    const isMember = await this.chatRepository.isMember(conversationId, userId);
    if (!isMember) return;

    await Promise.all([
      this.chatRepository.markMessagesSeen(conversationId, userId),
      this.chatRepository.resetUnreadCount(userId, conversationId),
      this.redisService.resetUnread(userId, conversationId),
    ]);
  }

  async markDelivered(conversationId: string, userId: string): Promise<void> {
    await this.chatRepository.markMessagesDelivered(conversationId, userId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getOfflineMembers(
    memberIds: string[],
    excludeId: string,
  ): Promise<string[]> {
    const others = memberIds.filter((id) => id !== excludeId);
    const onlineUsers = await this.redisService.getOnlineUsers(others);
    const onlineSet = new Set(onlineUsers);
    return others.filter((id) => !onlineSet.has(id));
  }
}
