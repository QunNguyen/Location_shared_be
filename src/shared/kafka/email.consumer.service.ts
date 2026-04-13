/**
 * Kafka Email Consumer
 * Handles: forgot-password emails, message notifications
 *
 * This is a standalone consumer that subscribes to Kafka topics
 * and processes events asynchronously (fire-and-forget pattern).
 *
 * In production: run this as a separate process/service.
 * In development: it's bootstrapped inside the same NestJS app via OnModuleInit.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { KafkaConsumerService } from '../../shared/kafka/kafka.consumer.service';
import { KAFKA_TOPICS } from '../../shared/kafka/kafka.producer.service';

interface ForgotPasswordPayload {
  userId: string;
  email: string;
  fullName: string;
  resetToken: string;
  resetUrl: string;
  expiresAt: string;
}

interface MessageNotificationPayload {
  userId: string;
  senderId: string;
  conversationId: string;
  messagePreview: string;
  conversationType: string;
  conversationName: string;
}

@Injectable()
export class EmailConsumerService implements OnModuleInit {
  private readonly logger = new Logger(EmailConsumerService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private kafkaConsumer: KafkaConsumerService,
    private configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  onModuleInit() {
    // Register handlers for each topic
    this.kafkaConsumer.on(KAFKA_TOPICS.FORGOT_PASSWORD, async (payload) => {
      const data = this.kafkaConsumer.parseMessage<ForgotPasswordPayload>(
        payload.message,
      );
      if (data) {
        await this.sendForgotPasswordEmail(data);
      }
    });

    this.kafkaConsumer.on(KAFKA_TOPICS.MESSAGE_NOTIFICATION, async (payload) => {
      const data = this.kafkaConsumer.parseMessage<MessageNotificationPayload>(
        payload.message,
      );
      if (data) {
        await this.sendMessageNotification(data);
      }
    });

    this.kafkaConsumer.on(KAFKA_TOPICS.ANALYTICS, async (payload) => {
      const data = this.kafkaConsumer.parseMessage<any>(payload.message);
      if (data) {
        this.logger.debug(`Analytics event: ${JSON.stringify(data)}`);
        // TODO: forward to analytics service (e.g. BigQuery, Mixpanel)
      }
    });

    this.logger.log('Email/Notification consumer handlers registered');
  }

  // ─── Email Templates ──────────────────────────────────────────────────────

  private async sendForgotPasswordEmail(data: ForgotPasswordPayload): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM', 'noreply@location-shared.com');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; background: #f4f4f4; }
            .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; padding: 32px; }
            .btn { display: inline-block; padding: 12px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0; }
            .warning { color: #888; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>🔐 Password Reset Request</h2>
            <p>Hi <strong>${data.fullName}</strong>,</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <a href="${data.resetUrl}" class="btn">Reset My Password</a>
            <p class="warning">This link expires at: ${new Date(data.expiresAt).toLocaleString()}</p>
            <p class="warning">If you didn't request this, please ignore this email. Your password will remain unchanged.</p>
            <hr/>
            <p class="warning">Location Shared — Travel & Community Platform</p>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to: data.email,
        subject: '🔐 Reset Your Password — Location Shared',
        html,
      });
      this.logger.log(`Password reset email sent to: ${data.email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${data.email}`, error.message);
    }
  }

  private async sendMessageNotification(data: MessageNotificationPayload): Promise<void> {
    // In production: send push notification via FCM/APNs
    // Here we just log — integrate with your push provider
    this.logger.debug(
      `Push notification queued for user ${data.userId}: "${data.messagePreview}"`,
    );
    // Example: await fcmService.send({ userId: data.userId, title: 'New Message', body: data.messagePreview })
  }
}
