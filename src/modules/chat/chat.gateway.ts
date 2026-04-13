import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatService } from './chat.service';
import { RedisService } from '../../shared/redis/redis.service';
import { SendMessageDto, EditMessageDto } from './dto/message.dto';
import { User, UserDocument } from '../user/schemas/user.schema';

// ─── Socket Event Constants ────────────────────────────────────────────────

export const CHAT_EVENTS = {
  // Client → Server
  JOIN_CONVERSATION: 'join_conversation',
  LEAVE_CONVERSATION: 'leave_conversation',
  SEND_MESSAGE: 'send_message',
  TYPING: 'typing',
  STOP_TYPING: 'stop_typing',
  SEEN_MESSAGE: 'seen_message',
  EDIT_MESSAGE: 'edit_message',
  RECALL_MESSAGE: 'recall_message',

  // Server → Client
  CONNECTED: 'connected',
  NEW_MESSAGE: 'new_message',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_DELIVERED: 'message_delivered',
  MESSAGE_SEEN: 'message_seen',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_RECALLED: 'message_recalled',
  USER_TYPING: 'user_typing',
  USER_STOP_TYPING: 'user_stop_typing',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  ERROR: 'error',
} as const;

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Map userId → Set<socketId> (a user can have multiple tabs/devices)
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private chatService: ChatService,
    private redisService: RedisService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Chat Gateway initialized on /chat');
  }

  // ─── Authentication Middleware ───────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) throw new WsException('No token provided');

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      const user = await this.userModel
        .findById(payload.sub)
        .select('_id fullName avatarUrl email role')
        .lean();

      if (!user || !user.isActive) throw new WsException('User not found');

      // Attach user to socket data
      client.data.user = user;
      client.data.userId = user._id.toString();

      // Track socket
      const userId = client.data.userId;
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(client.id);

      // Mark online in Redis + broadcast
      await this.redisService.setOnline(userId);

      // Join personal room (for targeted pushes)
      client.join(`user:${userId}`);

      // Notify contacts that this user is online
      this.server.emit(CHAT_EVENTS.USER_ONLINE, {
        userId,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
      });

      client.emit(CHAT_EVENTS.CONNECTED, {
        message: 'Connected to chat',
        userId,
      });

      this.logger.log(`Client connected: ${client.id} (userId: ${userId})`);
    } catch (error) {
      this.logger.warn(`Connection rejected: ${error.message}`);
      client.emit(CHAT_EVENTS.ERROR, { message: error.message });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;

    // Remove socket from tracking
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        // Only mark offline when all tabs/devices are disconnected
        await this.redisService.setOffline(userId);

        this.server.emit(CHAT_EVENTS.USER_OFFLINE, { userId });
        this.logger.log(`User went offline: ${userId}`);
      }
    }

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Join Conversation Room ──────────────────────────────────────────────

  @SubscribeMessage(CHAT_EVENTS.JOIN_CONVERSATION)
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.getUserId(client);
    const { conversationId } = data;

    const isMember = await this.chatService['chatRepository'].isMember(
      conversationId,
      userId,
    );
    if (!isMember) {
      client.emit(CHAT_EVENTS.ERROR, { message: 'Not a member of this conversation' });
      return;
    }

    client.join(`conversation:${conversationId}`);

    // Mark delivered when joining
    await this.chatService.markDelivered(conversationId, userId);

    // Broadcast delivery to sender(s) in this room
    this.server.to(`conversation:${conversationId}`).emit(CHAT_EVENTS.MESSAGE_DELIVERED, {
      conversationId,
      userId,
    });

    this.logger.debug(`${userId} joined conversation:${conversationId}`);
  }

  // ─── Leave Conversation Room ─────────────────────────────────────────────

  @SubscribeMessage(CHAT_EVENTS.LEAVE_CONVERSATION)
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }

  // ─── Send Message ────────────────────────────────────────────────────────

  @SubscribeMessage(CHAT_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessageDto,
  ) {
    try {
      const userId = this.getUserId(client);
      const message = await this.chatService.sendMessage(userId, data);

      // Ack to sender
      client.emit(CHAT_EVENTS.MESSAGE_SENT, { message });

      // Broadcast to conversation room (all members)
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit(CHAT_EVENTS.NEW_MESSAGE, { message });

      // Push to offline members' personal rooms (if they're online but not in the room)
      const conversation = await this.chatService['chatRepository'].findConversationById(
        data.conversationId,
      );
      if (conversation) {
        const memberIds = conversation.members.map((m: any) =>
          m._id ? m._id.toString() : m.toString(),
        );
        for (const memberId of memberIds) {
          if (memberId !== userId) {
            this.server
              .to(`user:${memberId}`)
              .emit(CHAT_EVENTS.NEW_MESSAGE, { message });
          }
        }
      }
    } catch (error) {
      client.emit(CHAT_EVENTS.ERROR, { message: error.message });
    }
  }

  // ─── Edit Message ────────────────────────────────────────────────────────

  @SubscribeMessage(CHAT_EVENTS.EDIT_MESSAGE)
  async handleEditMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; content: string },
  ) {
    try {
      const userId = this.getUserId(client);
      const dto: EditMessageDto = { content: data.content };
      const updated = await this.chatService.editMessage(data.messageId, userId, dto);

      const event = {
        messageId: data.messageId,
        content: updated.content,
        isEdited: true,
        conversationId: updated.conversationId,
      };

      this.server
        .to(`conversation:${updated.conversationId}`)
        .emit(CHAT_EVENTS.MESSAGE_UPDATED, event);
    } catch (error) {
      client.emit(CHAT_EVENTS.ERROR, { message: error.message });
    }
  }

  // ─── Recall Message ──────────────────────────────────────────────────────

  @SubscribeMessage(CHAT_EVENTS.RECALL_MESSAGE)
  async handleRecallMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string },
  ) {
    try {
      const userId = this.getUserId(client);
      const recalled = await this.chatService.recallMessage(data.messageId, userId);

      const event = {
        messageId: data.messageId,
        isRecalled: true,
        conversationId: recalled.conversationId,
      };

      this.server
        .to(`conversation:${recalled.conversationId}`)
        .emit(CHAT_EVENTS.MESSAGE_RECALLED, event);
    } catch (error) {
      client.emit(CHAT_EVENTS.ERROR, { message: error.message });
    }
  }

  // ─── Seen Message ────────────────────────────────────────────────────────

  @SubscribeMessage(CHAT_EVENTS.SEEN_MESSAGE)
  async handleSeenMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      const userId = this.getUserId(client);
      await this.chatService.seenMessage(data.conversationId, userId);

      this.server.to(`conversation:${data.conversationId}`).emit(CHAT_EVENTS.MESSAGE_SEEN, {
        conversationId: data.conversationId,
        userId,
        seenAt: new Date().toISOString(),
      });
    } catch (error) {
      client.emit(CHAT_EVENTS.ERROR, { message: error.message });
    }
  }

  // ─── Typing ───────────────────────────────────────────────────────────────

  @SubscribeMessage(CHAT_EVENTS.TYPING)
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;
    const user = client.data.user;

    client.to(`conversation:${data.conversationId}`).emit(CHAT_EVENTS.USER_TYPING, {
      conversationId: data.conversationId,
      userId,
      fullName: user?.fullName,
    });
  }

  @SubscribeMessage(CHAT_EVENTS.STOP_TYPING)
  handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;

    client
      .to(`conversation:${data.conversationId}`)
      .emit(CHAT_EVENTS.USER_STOP_TYPING, {
        conversationId: data.conversationId,
        userId,
      });
  }

  // ─── Utility methods (called from Controller/Service) ─────────────────────

  emitToConversation(event: string, conversationId: string, data: any) {
    this.server.to(`conversation:${conversationId}`).emit(event, data);
  }

  emitToUser(event: string, userId: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private getUserId(client: Socket): string {
    const userId = client.data?.userId;
    if (!userId) throw new WsException('Not authenticated');
    return userId;
  }

  private extractToken(client: Socket): string | null {
    const authHeader =
      client.handshake.headers?.authorization ||
      client.handshake.auth?.token;

    if (!authHeader) return null;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return typeof authHeader === 'string' ? authHeader : null;
  }
}
