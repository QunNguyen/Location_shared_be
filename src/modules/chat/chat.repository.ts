import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
  ConversationType,
} from './schemas/conversation.schema';
import {
  Message,
  MessageDocument,
  MessageStatus,
} from './schemas/message.schema';
import {
  UserConversation,
  UserConversationDocument,
} from './schemas/user-conversation.schema';

@Injectable()
export class ChatRepository {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(UserConversation.name)
    private userConversationModel: Model<UserConversationDocument>,
  ) {}

  // ─── Conversation ─────────────────────────────────────────────────────────

  async createConversation(data: Partial<Conversation>): Promise<ConversationDocument> {
    return this.conversationModel.create(data);
  }

  async findConversationById(id: string): Promise<any> {
    return this.conversationModel
      .findById(id)
      .populate('members', 'fullName avatarUrl email')
      .lean();
  }

  async findPrivateConversation(
    userId1: string,
    userId2: string,
  ): Promise<ConversationDocument | null> {
    return this.conversationModel.findOne({
      type: ConversationType.PRIVATE,
      isActive: true,
      members: {
        $all: [new Types.ObjectId(userId1), new Types.ObjectId(userId2)],
        $size: 2,
      },
    });
  }

  async findUserConversations(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<any[]> {
    return this.conversationModel
      .find({
        members: new Types.ObjectId(userId),
        isActive: true,
      })
      .populate('members', 'fullName avatarUrl')
      .populate('lastMessageSender', 'fullName')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async countUserConversations(userId: string): Promise<number> {
    return this.conversationModel.countDocuments({
      members: new Types.ObjectId(userId),
      isActive: true,
    });
  }

  async updateConversationLastMessage(
    conversationId: string,
    message: MessageDocument,
  ): Promise<void> {
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      lastMessage: message.isRecalled ? '[Message recalled]' : message.content,
      lastMessageId: message._id,
      lastMessageSender: message.senderId,
      lastMessageAt: message.createdAt,
    });
  }

  async addMembersToConversation(
    conversationId: string,
    memberIds: Types.ObjectId[],
  ): Promise<void> {
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      $addToSet: { members: { $each: memberIds } },
    });
  }

  async removeMemberFromConversation(
    conversationId: string,
    memberId: string,
  ): Promise<void> {
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      $pull: { members: new Types.ObjectId(memberId) },
    });
  }

  async updateConversation(
    conversationId: string,
    data: Partial<Conversation>,
  ): Promise<ConversationDocument> {
    return this.conversationModel.findByIdAndUpdate(
      conversationId,
      { $set: data },
      { new: true },
    );
  }

  async isMember(conversationId: string, userId: string): Promise<boolean> {
    const exists = await this.conversationModel.exists({
      _id: conversationId,
      members: new Types.ObjectId(userId),
      isActive: true,
    });
    return !!exists;
  }

  // ─── Message ──────────────────────────────────────────────────────────────

  async createMessage(data: Partial<Message>): Promise<MessageDocument> {
    return this.messageModel.create(data);
  }

  async findMessageById(id: string): Promise<any> {
    return this.messageModel
      .findById(id)
      .populate('senderId', 'fullName avatarUrl')
      .lean();
  }

  async findMessages(
    conversationId: string,
    skip: number,
    limit: number,
  ): Promise<any[]> {
    return this.messageModel
      .find({ conversationId: new Types.ObjectId(conversationId) })
      .populate('senderId', 'fullName avatarUrl')
      .populate('replyTo', 'content senderId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async countMessages(conversationId: string): Promise<number> {
    return this.messageModel.countDocuments({
      conversationId: new Types.ObjectId(conversationId),
    });
  }

  async updateMessage(
    messageId: string,
    data: Partial<Message>,
  ): Promise<MessageDocument | null> {
    return this.messageModel.findByIdAndUpdate(
      messageId,
      { $set: data },
      { new: true },
    );
  }

  async countUnreadMessages(
    conversationId: string,
    afterDate: Date,
    excludeUserId: string,
  ): Promise<number> {
    return this.messageModel.countDocuments({
      conversationId: new Types.ObjectId(conversationId),
      createdAt: { $gt: afterDate },
      senderId: { $ne: new Types.ObjectId(excludeUserId) },
    });
  }

  async markMessagesDelivered(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await this.messageModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        senderId: { $ne: new Types.ObjectId(userId) },
        status: MessageStatus.SENT,
      },
      { $set: { status: MessageStatus.DELIVERED } },
    );
  }

  async markMessagesSeen(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await this.messageModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        senderId: { $ne: new Types.ObjectId(userId) },
        status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED] },
      },
      { $set: { status: MessageStatus.SEEN } },
    );
  }

  // ─── UserConversation ─────────────────────────────────────────────────────

  async upsertUserConversation(
    userId: string,
    conversationId: string,
    data: Partial<UserConversation>,
  ): Promise<void> {
    await this.userConversationModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        conversationId: new Types.ObjectId(conversationId),
      },
      { $set: data },
      { upsert: true, new: true },
    );
  }

  async getUserConversation(
    userId: string,
    conversationId: string,
  ): Promise<UserConversationDocument | null> {
    return this.userConversationModel.findOne({
      userId: new Types.ObjectId(userId),
      conversationId: new Types.ObjectId(conversationId),
    });
  }

  async resetUnreadCount(userId: string, conversationId: string): Promise<void> {
    await this.userConversationModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        conversationId: new Types.ObjectId(conversationId),
      },
      { $set: { unreadCount: 0, lastReadAt: new Date() } },
      { upsert: true },
    );
  }

  async incrementUnreadForMembers(
    conversationId: string,
    excludeUserId: string,
    memberIds: string[],
  ): Promise<void> {
    const otherMembers = memberIds.filter((id) => id !== excludeUserId);
    const bulkOps = otherMembers.map((memberId) => ({
      updateOne: {
        filter: {
          userId: new Types.ObjectId(memberId),
          conversationId: new Types.ObjectId(conversationId),
        },
        update: { $inc: { unreadCount: 1 } },
        upsert: true,
      },
    }));
    if (bulkOps.length) {
      await this.userConversationModel.bulkWrite(bulkOps);
    }
  }
}
