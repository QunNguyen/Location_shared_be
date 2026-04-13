import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  size: number;
  mimetype: string;
  originalName: string;
}

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private bucketName: string;
  private endPoint: string;
  private port: number;
  private useSSL: boolean;

  constructor(private configService: ConfigService) {
    this.endPoint = this.configService.get<string>('minio.endPoint');
    this.port = this.configService.get<number>('minio.port');
    this.useSSL = this.configService.get<boolean>('minio.useSSL');
    this.bucketName = this.configService.get<string>('minio.bucketName');

    this.client = new Minio.Client({
      endPoint: this.endPoint,
      port: this.port,
      useSSL: this.useSSL,
      accessKey: this.configService.get<string>('minio.accessKey'),
      secretKey: this.configService.get<string>('minio.secretKey'),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName, 'us-east-1');
        // Set public read policy
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucketName}/*`],
            },
          ],
        };
        await this.client.setBucketPolicy(
          this.bucketName,
          JSON.stringify(policy),
        );
        this.logger.log(`Bucket '${this.bucketName}' created with public policy`);
      } else {
        this.logger.log(`Bucket '${this.bucketName}' already exists`);
      }
    } catch (error) {
      this.logger.error('MinIO init error', error.message);
    }
  }

  private buildObjectKey(folder: string, originalName: string): string {
    const ext = path.extname(originalName).toLowerCase();
    const id = uuidv4();
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `${folder}/${date}/${id}${ext}`;
  }

  private buildUrl(objectKey: string): string {
    const protocol = this.useSSL ? 'https' : 'http';
    return `${protocol}://${this.endPoint}:${this.port}/${this.bucketName}/${objectKey}`;
  }

  private validateFile(
    file: UploadedFile,
    allowedTypes: string[] = ALLOWED_FILE_TYPES,
  ): void {
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds the limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type '${file.mimetype}' is not allowed`,
      );
    }
  }

  async uploadFile(
    file: UploadedFile,
    folder: string = 'uploads',
    onlyImages = false,
  ): Promise<UploadResult> {
    this.validateFile(file, onlyImages ? ALLOWED_IMAGE_TYPES : ALLOWED_FILE_TYPES);

    const objectKey = this.buildObjectKey(folder, file.originalname);

    try {
      await this.client.putObject(
        this.bucketName,
        objectKey,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype },
      );

      return {
        url: this.buildUrl(objectKey),
        key: objectKey,
        bucket: this.bucketName,
        size: file.size,
        mimetype: file.mimetype,
        originalName: file.originalname,
      };
    } catch (error) {
      this.logger.error('Upload failed', error.message);
      throw new InternalServerErrorException('File upload failed');
    }
  }

  async uploadMultiple(
    files: UploadedFile[],
    folder: string = 'uploads',
    onlyImages = false,
  ): Promise<UploadResult[]> {
    return Promise.all(
      files.map((file) => this.uploadFile(file, folder, onlyImages)),
    );
  }

  async deleteFile(objectKey: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucketName, objectKey);
      this.logger.debug(`Deleted object: ${objectKey}`);
    } catch (error) {
      this.logger.error(`Failed to delete object: ${objectKey}`, error.message);
    }
  }

  async deleteMultiple(objectKeys: string[]): Promise<void> {
    try {
      await this.client.removeObjects(this.bucketName, objectKeys);
    } catch (error) {
      this.logger.error('Failed to delete objects', error.message);
    }
  }

  async getPresignedUrl(objectKey: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(
      this.bucketName,
      objectKey,
      expirySeconds,
    );
  }
}
