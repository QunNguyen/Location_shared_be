import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostDto } from './dto/query-post.dto';
import { MinioService, UploadedFile } from '../../shared/minio/minio.service';
import { RedisService } from '../../shared/redis/redis.service';
import { paginate } from '../../common/dto/pagination.dto';
import { sanitizeObject } from '../../common/utils/sanitize.util';

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    private minioService: MinioService,
    private redisService: RedisService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    userId: string,
    dto: CreatePostDto,
    files: UploadedFile[],
  ): Promise<PostDocument> {
    const sanitized = sanitizeObject(dto);

    let images: string[] = [];
    let imageKeys: string[] = [];

    if (files?.length) {
      const results = await this.minioService.uploadMultiple(files, 'posts', true);
      images = results.map((r) => r.url);
      imageKeys = results.map((r) => r.key);
    }

    const post = await this.postModel.create({
      author: new Types.ObjectId(userId),
      title: sanitized.title,
      description: sanitized.description,
      tags: sanitized.tags || [],
      locationName: sanitized.locationName,
      location: {
        type: 'Point',
        coordinates: [sanitized.location.longitude, sanitized.location.latitude],
      },
      images,
      imageKeys,
    });

    await this.redisService.invalidatePattern(`posts:list:*`);
    return post;
  }

  // ─── Find All ─────────────────────────────────────────────────────────────

  async findAll(query: QueryPostDto) {
    const {
      page = 1,
      limit = 20,
      search,
      tag,
      authorId,
      lng,
      lat,
      radius = 5000,
      minRating,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const cacheKey = `posts:list:${JSON.stringify(query)}`;
    const cached = await this.redisService.getJson(cacheKey);
    if (cached) return cached;

    const filter: any = { isActive: true };

    if (search) {
      filter.$text = { $search: search };
    }
    if (tag) {
      filter.tags = tag;
    }
    if (authorId) {
      filter.author = new Types.ObjectId(authorId);
    }
    if (minRating !== undefined) {
      filter.averageRating = { $gte: minRating };
    }

    // Geo search takes priority over regular sort
    if (lng !== undefined && lat !== undefined) {
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius,
        },
      };
    }

    const skip = (page - 1) * limit;
    const sortOptions: any = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [items, total] = await Promise.all([
      this.postModel
        .find(filter)
        .populate('author', 'fullName avatarUrl')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.postModel.countDocuments(filter),
    ]);

    const result = paginate(items, total, page, limit);
    await this.redisService.setJson(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

  async findById(postId: string): Promise<PostDocument> {
    const cacheKey = `posts:${postId}`;
    const cached = await this.redisService.getJson<PostDocument>(cacheKey);
    if (cached) return cached;

    const post = await this.postModel
      .findOne({ _id: postId, isActive: true })
      .populate('author', 'fullName avatarUrl email')
      .lean();

    if (!post) throw new NotFoundException('Post not found');

    await this.redisService.setJson(cacheKey, post, this.CACHE_TTL);

    // Async increment view count
    this.postModel
      .findByIdAndUpdate(postId, { $inc: { viewCount: 1 } })
      .exec()
      .catch(() => {});

    return post as unknown as PostDocument;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    postId: string,
    userId: string,
    dto: UpdatePostDto,
    files?: UploadedFile[],
  ): Promise<PostDocument> {
    const post = await this.postModel.findById(postId);
    if (!post || !post.isActive) throw new NotFoundException('Post not found');
    if (post.author.toString() !== userId) throw new ForbiddenException('Not your post');

    const sanitized = sanitizeObject(dto);
    const updateData: any = { ...sanitized };

    if (sanitized.location) {
      updateData.location = {
        type: 'Point',
        coordinates: [sanitized.location.longitude, sanitized.location.latitude],
      };
      delete updateData['location.longitude'];
      delete updateData['location.latitude'];
    }

    if (files?.length) {
      // Delete old images
      if (post.imageKeys?.length) {
        await this.minioService.deleteMultiple(post.imageKeys);
      }
      const results = await this.minioService.uploadMultiple(files, 'posts', true);
      updateData.images = results.map((r) => r.url);
      updateData.imageKeys = results.map((r) => r.key);
    }

    const updated = await this.postModel
      .findByIdAndUpdate(postId, { $set: updateData }, { new: true })
      .populate('author', 'fullName avatarUrl');

    await this.redisService.del(`posts:${postId}`);
    await this.redisService.invalidatePattern(`posts:list:*`);
    return updated;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(postId: string, userId: string): Promise<void> {
    const post = await this.postModel.findById(postId);
    if (!post || !post.isActive) throw new NotFoundException('Post not found');
    if (post.author.toString() !== userId) throw new ForbiddenException('Not your post');

    // Soft delete
    await this.postModel.findByIdAndUpdate(postId, { isActive: false });

    // Delete images from MinIO
    if (post.imageKeys?.length) {
      await this.minioService.deleteMultiple(post.imageKeys).catch(() => {});
    }

    await this.redisService.del(`posts:${postId}`);
    await this.redisService.invalidatePattern(`posts:list:*`);
  }

  // ─── Internal helpers (used by Review module) ──────────────────────────────

  async updateRatingStats(postId: string): Promise<void> {
    // This is called by ReviewService after a review is saved
    // We recalculate from the Review model — done via Review service injection
    await this.redisService.del(`posts:${postId}`);
  }

  async incrementCommentCount(postId: string, delta = 1): Promise<void> {
    await this.postModel.findByIdAndUpdate(postId, {
      $inc: { commentCount: delta },
    });
    await this.redisService.del(`posts:${postId}`);
  }
}
