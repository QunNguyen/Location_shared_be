import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, UserDocument } from '../user/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { KafkaProducerService, KAFKA_TOPICS } from '../../shared/kafka/kafka.producer.service';
import { sanitizeObject } from '../../common/utils/sanitize.util';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private kafkaProducer: KafkaProducerService,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<{ user: UserDocument; tokens: AuthTokens }> {
    const sanitized = sanitizeObject(dto);

    const existing = await this.userModel.findOne({
      email: sanitized.email.toLowerCase(),
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(sanitized.password, 12);

    const user = await this.userModel.create({
      ...sanitized,
      email: sanitized.email.toLowerCase(),
      password: hashedPassword,
    });

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`New user registered: ${user.email}`);
    return { user, tokens };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<{ user: UserDocument; tokens: AuthTokens }> {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+password +refreshToken');

    if (!user) {
      throw new UnauthorizedException('Account or password is incorrect');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Account or password is incorrect');
    }

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user, tokens };
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────

  async refreshTokens(userId: string, refreshToken: string): Promise<AuthTokens> {
    const user = await this.userModel
      .findById(userId)
      .select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });

    if (!user) {
      // Don't reveal whether email exists
      this.logger.warn(`Forgot password requested for non-existent: ${dto.email}`);
      return;
    }

    const resetToken = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userModel.findByIdAndUpdate(user.id, {
      passwordResetToken: resetToken,
      passwordResetExpires: expires,
    });

    // Publish to Kafka → email consumer handles sending
    await this.kafkaProducer.send({
      topic: KAFKA_TOPICS.FORGOT_PASSWORD,
      key: user.id,
      value: {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        resetToken,
        resetUrl: `http://localhost:3000/reset-password?token=${resetToken}`,
        expiresAt: expires.toISOString(),
      },
    });

    this.logger.log(`Password reset email queued for: ${user.email}`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async generateTokens(user: UserDocument): Promise<AuthTokens> {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: token });
  }
}
