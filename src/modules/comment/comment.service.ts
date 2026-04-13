import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Post, PostDocument } from '../post/schemas/post.schema';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';
import { paginate, PaginationDto } from '../../common/dto/pagination.dto';
import { sanitizeObject } from '../../common/utils/sanitize.util';

@Injectable()
export class CommentService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
  ) {}

  async create(
    postId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<CommentDocument> {
    const post = await this.postModel.findOne({ _id: postId, isActive: true });
    if (!post) throw new NotFoundException('Post not found');

    const sanitized = sanitizeObject(dto);

    let parentObjectId: Types.ObjectId | null = null;
    if (sanitized.parentId) {
      const parent = await this.commentModel.findOne({
        _id: sanitized.parentId,
        post: postId,
        isActive: true,
      });
      if (!parent) throw new BadRequestException('Parent comment not found');
      if (parent.parent) {
        // Prevent deep nesting beyond 1 level (reply to reply not allowed)
        throw new BadRequestException('Cannot reply to a reply');
      }
      parentObjectId = new Types.ObjectId(sanitized.parentId);

      // Increment reply count on parent
      await this.commentModel.findByIdAndUpdate(sanitized.parentId, {
        $inc: { replyCount: 1 },
      });
    }

    const comment = await this.commentModel.create({
      post: new Types.ObjectId(postId),
      author: new Types.ObjectId(userId),
      parent: parentObjectId,
      content: sanitized.content,
    });

    // Increment commentCount on post
    await this.postModel.findByIdAndUpdate(postId, {
      $inc: { commentCount: 1 },
    });

    return this.commentModel
      .findById(comment._id)
      .populate('author', 'fullName avatarUrl');
  }

  async findByPost(postId: string, query: PaginationDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Only fetch root comments (parent = null)
    const filter = { post: postId, parent: null, isActive: true };

    const [items, total] = await Promise.all([
      this.commentModel
        .find(filter)
        .populate('author', 'fullName avatarUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.commentModel.countDocuments(filter),
    ]);

    return paginate(items, total, page, limit);
  }

  async findReplies(commentId: string, query: PaginationDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const filter = { parent: commentId, isActive: true };

    const [items, total] = await Promise.all([
      this.commentModel
        .find(filter)
        .populate('author', 'fullName avatarUrl')
        .sort({ createdAt: 1 }) // oldest first for replies
        .skip(skip)
        .limit(limit)
        .lean(),
      this.commentModel.countDocuments(filter),
    ]);

    return paginate(items, total, page, limit);
  }

  async update(
    commentId: string,
    userId: string,
    dto: UpdateCommentDto,
  ): Promise<CommentDocument> {
    const comment = await this.commentModel.findById(commentId);
    if (!comment || !comment.isActive) throw new NotFoundException('Comment not found');
    if (comment.author.toString() !== userId) throw new ForbiddenException('Not your comment');

    const sanitized = sanitizeObject(dto);
    return this.commentModel
      .findByIdAndUpdate(commentId, { content: sanitized.content }, { new: true })
      .populate('author', 'fullName avatarUrl');
  }

  async remove(commentId: string, userId: string): Promise<void> {
    const comment = await this.commentModel.findById(commentId);
    if (!comment || !comment.isActive) throw new NotFoundException('Comment not found');
    if (comment.author.toString() !== userId) throw new ForbiddenException('Not your comment');

    const postId = comment.post.toString();

    // Soft delete
    await this.commentModel.findByIdAndUpdate(commentId, { isActive: false });

    // If it's a root comment, also soft-delete its replies
    if (!comment.parent) {
      const repliesDeleted = await this.commentModel.updateMany(
        { parent: commentId },
        { isActive: false },
      );
      // Decrement post comment count (root + replies)
      await this.postModel.findByIdAndUpdate(postId, {
        $inc: { commentCount: -(1 + repliesDeleted.modifiedCount) },
      });
    } else {
      // It's a reply — decrement parent replyCount
      await this.commentModel.findByIdAndUpdate(comment.parent, {
        $inc: { replyCount: -1 },
      });
      await this.postModel.findByIdAndUpdate(postId, {
        $inc: { commentCount: -1 },
      });
    }
  }
}
