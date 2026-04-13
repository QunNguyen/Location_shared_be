import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  SEEN = 'seen',
}

export interface Attachment {
  url: string;
  key: string;
  type: string; // mimetype
  name: string;
  size: number;
}

@Schema({ timestamps: true, collection: 'messages' })
export class Message {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId: Types.ObjectId;

  @Prop({ trim: true, maxlength: 5000 })
  content: string;

  @Prop({
    type: [
      {
        url: String,
        key: String,
        type: String,
        name: String,
        size: Number,
      },
    ],
    default: [],
  })
  attachments: Attachment[];

  @Prop({
    type: String,
    enum: MessageStatus,
    default: MessageStatus.SENT,
  })
  status: MessageStatus;

  @Prop({ default: false })
  isEdited: boolean;

  @Prop({ default: false })
  isRecalled: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  replyTo: Types.ObjectId | null; // optional quoted message

  createdAt: Date;
  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, status: 1 });
