import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserConversationDocument = UserConversation & Document;

@Schema({ timestamps: false, collection: 'user_conversations' })
export class UserConversation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: Types.ObjectId;

  @Prop({ default: () => new Date() })
  lastReadAt: Date;

  @Prop({ default: 0 })
  unreadCount: number;

  @Prop({ default: false })
  isMuted: boolean;

  @Prop({ default: false })
  isArchived: boolean;
}

export const UserConversationSchema = SchemaFactory.createForClass(UserConversation);

UserConversationSchema.index({ userId: 1, conversationId: 1 }, { unique: true });
UserConversationSchema.index({ userId: 1, lastReadAt: -1 });
