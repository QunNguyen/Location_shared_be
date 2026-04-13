import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Block, BlockDocument } from './schemas/block.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { MinioService, UploadedFile } from '../../shared/minio/minio.service';
import { sanitizeObject } from '../../common/utils/sanitize.util';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Block.name) private blockModel: Model<BlockDocument>,
    private minioService: MinioService,
  ) {}

  // ─── Profile ───────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(userId)
      .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
      .lean();

    if (!user) throw new NotFoundException('User not found');
    return user as unknown as UserDocument;
  }

  async getPublicProfile(targetId: string, requesterId: string): Promise<UserDocument> {
    const isBlocked = await this.blockModel.exists({
      $or: [
        { blocker: targetId, blocked: requesterId },
        { blocker: requesterId, blocked: targetId },
      ],
    });

    if (isBlocked) throw new NotFoundException('User not found');

    const user = await this.userModel
      .findById(targetId)
      .select('fullName avatarUrl interests createdAt')
      .lean();

    if (!user || !user.isActive) throw new NotFoundException('User not found');
    return user as unknown as UserDocument;
  }

  async updateProfile(userId: string, dto: UpdateUserDto): Promise<UserDocument> {
    const sanitized = sanitizeObject(dto);
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: sanitized }, { new: true, runValidators: true })
      .select('-password -refreshToken');

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ─── Avatar ────────────────────────────────────────────────────────────────

  async uploadAvatar(userId: string, file: UploadedFile): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Delete old avatar if exists
    if (user.avatarKey) {
      await this.minioService.deleteFile(user.avatarKey);
    }

    const result = await this.minioService.uploadFile(file, 'avatars', true);

    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { avatarUrl: result.url, avatarKey: result.key },
        { new: true },
      )
      .select('-password -refreshToken');

    return updated;
  }

  // ─── Search users ─────────────────────────────────────────────────────────

  async searchUsers(query: PaginationDto, requesterId: string) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    // Get blocked user IDs to exclude
    const blocks = await this.blockModel.find({
      $or: [{ blocker: requesterId }, { blocked: requesterId }],
    }).lean();
    const blockedIds = blocks.map((b) =>
      b.blocker.toString() === requesterId ? b.blocked : b.blocker,
    );

    const filter: any = {
      isActive: true,
      _id: { $ne: requesterId, $nin: blockedIds },
    };

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('fullName email avatarUrl interests')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return paginate(items, total, page, limit);
  }

  // ─── Block / Unblock ──────────────────────────────────────────────────────

  async blockUser(blockerId: string, targetId: string): Promise<void> {
    if (blockerId === targetId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const target = await this.userModel.findById(targetId);
    if (!target) throw new NotFoundException('User not found');

    const exists = await this.blockModel.exists({ blocker: blockerId, blocked: targetId });
    if (exists) throw new ConflictException('User already blocked');

    await this.blockModel.create({ blocker: blockerId, blocked: targetId });
  }

  async unblockUser(blockerId: string, targetId: string): Promise<void> {
    const result = await this.blockModel.findOneAndDelete({
      blocker: blockerId,
      blocked: targetId,
    });
    if (!result) throw new NotFoundException('Block relationship not found');
  }

  async getBlockList(userId: string) {
    return this.blockModel
      .find({ blocker: userId })
      .populate('blocked', 'fullName email avatarUrl')
      .lean();
  }

  async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    const block = await this.blockModel.exists({
      $or: [
        { blocker: userId1, blocked: userId2 },
        { blocker: userId2, blocked: userId1 },
      ],
    });
    return !!block;
  }
}
