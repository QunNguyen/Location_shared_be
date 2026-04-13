import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { Post, PostDocument } from '../post/schemas/post.schema';
import { CreateReviewDto, UpdateReviewDto } from './dto/review.dto';
import { MinioService, UploadedFile } from '../../shared/minio/minio.service';
import { paginate, PaginationDto } from '../../common/dto/pagination.dto';
import { sanitizeObject } from '../../common/utils/sanitize.util';

@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    private minioService: MinioService,
  ) {}

  async create(
    postId: string,
    userId: string,
    dto: CreateReviewDto,
    files: UploadedFile[],
  ): Promise<ReviewDocument> {
    const post = await this.postModel.findOne({ _id: postId, isActive: true });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.reviewModel.exists({
      post: postId,
      author: userId,
    });
    if (existing) throw new ConflictException('You have already reviewed this post');

    const sanitized = sanitizeObject(dto);

    let images: string[] = [];
    let imageKeys: string[] = [];
    if (files?.length) {
      const results = await this.minioService.uploadMultiple(files, 'reviews', true);
      images = results.map((r) => r.url);
      imageKeys = results.map((r) => r.key);
    }

    const review = await this.reviewModel.create({
      post: new Types.ObjectId(postId),
      author: new Types.ObjectId(userId),
      rating: sanitized.rating,
      comment: sanitized.comment,
      images,
      imageKeys,
    });

    // Recalculate average rating on the post
    await this.recalcPostRating(postId);

    return review;
  }

  async findByPost(postId: string, query: PaginationDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.reviewModel
        .find({ post: postId })
        .populate('author', 'fullName avatarUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.reviewModel.countDocuments({ post: postId }),
    ]);

    return paginate(items, total, page, limit);
  }

  async update(
    reviewId: string,
    userId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewDocument> {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) throw new NotFoundException('Review not found');
    if (review.author.toString() !== userId) throw new ForbiddenException('Not your review');

    const sanitized = sanitizeObject(dto);
    const updated = await this.reviewModel.findByIdAndUpdate(
      reviewId,
      { $set: sanitized },
      { new: true },
    );

    await this.recalcPostRating(review.post.toString());
    return updated;
  }

  async remove(reviewId: string, userId: string): Promise<void> {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) throw new NotFoundException('Review not found');
    if (review.author.toString() !== userId) throw new ForbiddenException('Not your review');

    const postId = review.post.toString();

    if (review.imageKeys?.length) {
      await this.minioService.deleteMultiple(review.imageKeys).catch(() => {});
    }

    await this.reviewModel.findByIdAndDelete(reviewId);
    await this.recalcPostRating(postId);
  }

  private async recalcPostRating(postId: string): Promise<void> {
    const stats = await this.reviewModel.aggregate([
      { $match: { post: new Types.ObjectId(postId) } },
      {
        $group: {
          _id: '$post',
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    const avgRating = stats[0]?.avgRating ?? 0;
    const reviewCount = stats[0]?.count ?? 0;

    await this.postModel.findByIdAndUpdate(postId, {
      averageRating: Math.round(avgRating * 10) / 10,
      reviewCount,
    });
  }
}
