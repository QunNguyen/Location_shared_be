import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService } from '../../modules/chat/chat.service';
import { ChatRepository } from '../../modules/chat/chat.repository';
import { MinioService } from '../../shared/minio/minio.service';
import { RedisService } from '../../shared/redis/redis.service';
import { KafkaProducerService } from '../../shared/kafka/kafka.producer.service';
import { UserService } from '../../modules/user/user.service';
import { ConversationType } from '../../modules/chat/schemas/conversation.schema';

describe('ChatService', () => {
  let service: ChatService;
  let chatRepository: ChatRepository;
  let redisService: RedisService;
  let userService: UserService;

  const userId1 = '507f1f77bcf86cd799439011';
  const userId2 = '507f1f77bcf86cd799439012';
  const convId = '507f1f77bcf86cd799439013';

  const mockConversation = {
    _id: { toString: () => convId },
    type: ConversationType.PRIVATE,
    members: [
      { _id: { toString: () => userId1 } },
      { _id: { toString: () => userId2 } },
    ],
    isActive: true,
    groupAdmin: null,
    lastMessageId: null,
  };

  const mockChatRepository = {
    findPrivateConversation: jest.fn(),
    createConversation: jest.fn(),
    findConversationById: jest.fn(),
    upsertUserConversation: jest.fn(),
    isMember: jest.fn(),
    createMessage: jest.fn(),
    findMessageById: jest.fn(),
    updateConversationLastMessage: jest.fn(),
    incrementUnreadForMembers: jest.fn(),
    markMessagesSeen: jest.fn(),
    resetUnreadCount: jest.fn(),
    updateMessage: jest.fn(),
    updateConversation: jest.fn(),
  };

  const mockRedisService = {
    getUnreadCount: jest.fn().mockResolvedValue(0),
    incrementUnread: jest.fn(),
    resetUnread: jest.fn(),
    getOnlineUsers: jest.fn().mockResolvedValue([]),
    setOnline: jest.fn(),
    setOffline: jest.fn(),
  };

  const mockKafkaProducer = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  const mockMinioService = {
    uploadMultiple: jest.fn().mockResolvedValue([]),
  };

  const mockUserService = {
    isBlocked: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: ChatRepository, useValue: mockChatRepository },
        { provide: MinioService, useValue: mockMinioService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    chatRepository = module.get<ChatRepository>(ChatRepository);
    redisService = module.get<RedisService>(RedisService);
    userService = module.get<UserService>(UserService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Create Private Conversation ──────────────────────────────────────────

  describe('createOrGetPrivateConversation', () => {
    it('should throw BadRequestException if talking to self', async () => {
      await expect(
        service.createOrGetPrivateConversation(userId1, userId1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if user is blocked', async () => {
      mockUserService.isBlocked = jest.fn().mockResolvedValue(true);

      await expect(
        service.createOrGetPrivateConversation(userId1, userId2),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return existing conversation if already exists', async () => {
      mockUserService.isBlocked = jest.fn().mockResolvedValue(false);
      mockChatRepository.findPrivateConversation.mockResolvedValue(mockConversation);

      const result = await service.createOrGetPrivateConversation(userId1, userId2);

      expect(result).toEqual(mockConversation);
      expect(mockChatRepository.createConversation).not.toHaveBeenCalled();
    });

    it('should create new conversation if not exists', async () => {
      mockUserService.isBlocked = jest.fn().mockResolvedValue(false);
      mockChatRepository.findPrivateConversation.mockResolvedValue(null);
      mockChatRepository.createConversation.mockResolvedValue(mockConversation);
      mockChatRepository.findConversationById.mockResolvedValue(mockConversation);
      mockChatRepository.upsertUserConversation.mockResolvedValue(undefined);

      const result = await service.createOrGetPrivateConversation(userId1, userId2);

      expect(mockChatRepository.createConversation).toHaveBeenCalled();
      expect(result).toEqual(mockConversation);
    });
  });

  // ─── Send Message ─────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('should throw ForbiddenException if not a member', async () => {
      mockChatRepository.isMember.mockResolvedValue(false);

      await expect(
        service.sendMessage(userId1, { conversationId: convId, content: 'Hello' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if no content or attachments', async () => {
      mockChatRepository.isMember.mockResolvedValue(true);

      await expect(
        service.sendMessage(userId1, { conversationId: convId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should send message and update conversation', async () => {
      const mockMessage = {
        _id: { toString: () => 'msg123' },
        conversationId: { toString: () => convId },
        senderId: { toString: () => userId1 },
        content: 'Hello',
        createdAt: new Date(),
      };

      mockChatRepository.isMember.mockResolvedValue(true);
      mockChatRepository.createMessage.mockResolvedValue(mockMessage);
      mockChatRepository.findMessageById.mockResolvedValue(mockMessage);
      mockChatRepository.findConversationById.mockResolvedValue(mockConversation);
      mockChatRepository.updateConversationLastMessage.mockResolvedValue(undefined);
      mockChatRepository.incrementUnreadForMembers.mockResolvedValue(undefined);

      const result = await service.sendMessage(userId1, {
        conversationId: convId,
        content: 'Hello',
      });

      expect(mockChatRepository.createMessage).toHaveBeenCalled();
      expect(mockChatRepository.updateConversationLastMessage).toHaveBeenCalled();
      expect(result).toEqual(mockMessage);
    });
  });

  // ─── Recall Message ───────────────────────────────────────────────────────

  describe('recallMessage', () => {
    it('should throw ForbiddenException if not the sender', async () => {
      mockChatRepository.findMessageById.mockResolvedValue({
        _id: 'msg1',
        senderId: { toString: () => userId2 }, // different sender
        isRecalled: false,
        conversationId: { toString: () => convId },
      });

      await expect(
        service.recallMessage('msg1', userId1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should recall message and set isRecalled = true', async () => {
      const mockMessage = {
        _id: 'msg1',
        senderId: { toString: () => userId1 },
        isRecalled: false,
        conversationId: { toString: () => convId },
        lastMessageId: null,
      };

      mockChatRepository.findMessageById
        .mockResolvedValueOnce(mockMessage)
        .mockResolvedValueOnce(mockConversation);

      mockChatRepository.updateMessage.mockResolvedValue({
        ...mockMessage,
        isRecalled: true,
        content: null,
      });
      mockChatRepository.findConversationById.mockResolvedValue({
        ...mockConversation,
        lastMessageId: null,
      });

      const result = await service.recallMessage('msg1', userId1);

      expect(mockChatRepository.updateMessage).toHaveBeenCalledWith('msg1', {
        isRecalled: true,
        content: null,
      });
      expect(result.isRecalled).toBe(true);
    });
  });
});
