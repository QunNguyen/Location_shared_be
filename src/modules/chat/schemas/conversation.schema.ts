import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

export enum ConversationType {
  PRIVATE = 'private',
  GROUP = 'group',
}

@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  _id: Types.ObjectId;

  @Prop({
    type: String,
    enum: ConversationType,
    required: true,
    default: ConversationType.PRIVATE,
  })
  type: ConversationType;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true, index: true })
  members: Types.ObjectId[];

  @Prop({ trim: true })
  name: string; // Group name

  @Prop()
  avatarUrl: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  groupAdmin: Types.ObjectId;

  @Prop()
  lastMessage: string;

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  lastMessageId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastMessageSender: Types.ObjectId;

  @Prop()
  lastMessageAt: Date;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ type: 1, members: 1 });
