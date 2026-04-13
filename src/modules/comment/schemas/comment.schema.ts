import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommentDocument = Comment & Document;

@Schema({ timestamps: true, collection: 'comments' })
export class Comment {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', required: true, index: true })
  post: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Comment', default: null, index: true })
  parent: Types.ObjectId | null; // null = root comment, set = reply

  @Prop({ required: true, trim: true, maxlength: 2000 })
  content: string;

  @Prop({ default: 0 })
  replyCount: number;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ post: 1, parent: 1, createdAt: -1 });
CommentSchema.index({ author: 1 });
CommentSchema.index({ parent: 1 });
