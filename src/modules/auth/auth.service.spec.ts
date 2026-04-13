import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AuthService } from '../../modules/auth/auth.service';
import { User } from '../../modules/user/schemas/user.schema';
import { KafkaProducerService } from '../../shared/kafka/kafka.producer.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let userModel: any;
  let jwtService: JwtService;
  let kafkaProducer: KafkaProducerService;

  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    fullName: 'Test User',
    email: 'test@example.com',
    password: '$2b$12$hashedpassword',
    role: 'user',
    isActive: true,
    refreshToken: null,
    toJSON: () => ({
      _id: '507f1f77bcf86cd799439011',
      fullName: 'Test User',
      email: 'test@example.com',
    }),
  };

  const mockUserModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock_token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const map: Record<string, any> = {
        'jwt.accessSecret': 'test-secret',
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.refreshExpiresIn': '7d',
      };
      return map[key];
    }),
  };

  const mockKafkaProducer = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    kafkaProducer = module.get<KafkaProducerService>(KafkaProducerService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should register a new user successfully', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(mockUser);
      mockUserModel.findByIdAndUpdate.mockResolvedValue(mockUser);

      const result = await service.register({
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'Password@123',
      });

      expect(result.user).toBeDefined();
      expect(result.tokens.accessToken).toBe('mock_token');
      expect(result.tokens.refreshToken).toBe('mock_token');
    });

    it('should throw ConflictException if email already exists', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);

      await expect(
        service.register({
          fullName: 'Test User',
          email: 'test@example.com',
          password: 'Password@123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── Login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should login successfully with correct credentials', async () => {
      const hashedPassword = await bcrypt.hash('Password@123', 12);
      const userWithPassword = { ...mockUser, password: hashedPassword };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(userWithPassword),
      });
      mockUserModel.findByIdAndUpdate.mockResolvedValue(userWithPassword);

      const result = await service.login({
        email: 'test@example.com',
        password: 'Password@123',
      });

      expect(result.tokens.accessToken).toBe('mock_token');
    });

    it('should throw UnauthorizedException with wrong password', async () => {
      const userWithPassword = {
        ...mockUser,
        password: await bcrypt.hash('DifferentPassword@123', 12),
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(userWithPassword),
      });

      await expect(
        service.login({ email: 'test@example.com', password: 'WrongPassword@123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.login({ email: 'notfound@example.com', password: 'Password@123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Forgot Password ──────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should send Kafka event for forgot password', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);
      mockUserModel.findByIdAndUpdate.mockResolvedValue(mockUser);

      await service.forgotPassword({ email: 'test@example.com' });

      expect(mockKafkaProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'auth.forgot_password' }),
      );
    });

    it('should not throw if email does not exist (security)', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ email: 'notfound@example.com' }),
      ).resolves.not.toThrow();

      expect(mockKafkaProducer.send).not.toHaveBeenCalled();
    });
  });

  // ─── Logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should clear refresh token on logout', async () => {
      mockUserModel.findByIdAndUpdate.mockResolvedValue(mockUser);

      await service.logout('507f1f77bcf86cd799439011');

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { refreshToken: null },
      );
    });
  });
});
