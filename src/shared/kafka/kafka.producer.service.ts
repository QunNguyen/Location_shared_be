import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, RecordMetadata, CompressionTypes } from 'kafkajs';

export interface KafkaMessage<T = any> {
  topic: string;
  key?: string;
  value: T;
}

export const KAFKA_TOPICS = {
  FORGOT_PASSWORD: 'auth.forgot_password',
  NOTIFICATION: 'notification.send',
  ANALYTICS: 'analytics.event',
  MESSAGE_NOTIFICATION: 'chat.message_notification',
} as const;

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;

  constructor(private configService: ConfigService) {
    this.kafka = new Kafka({
      clientId: this.configService.get<string>('kafka.clientId'),
      brokers: this.configService.get<string[]>('kafka.brokers'),
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', error.message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async send<T>(message: KafkaMessage<T>): Promise<RecordMetadata[]> {
    try {
      const records = await this.producer.send({
        topic: message.topic,
        compression: CompressionTypes.GZIP,
        messages: [
          {
            key: message.key || null,
            value: JSON.stringify(message.value),
            timestamp: Date.now().toString(),
          },
        ],
      });
      this.logger.debug(`Message sent to topic: ${message.topic}`);
      return records;
    } catch (error) {
      this.logger.error(`Failed to send message to ${message.topic}`, error.message);
      throw error;
    }
  }

  async sendBatch<T>(messages: KafkaMessage<T>[]): Promise<void> {
    const grouped = messages.reduce((acc, msg) => {
      if (!acc[msg.topic]) acc[msg.topic] = [];
      acc[msg.topic].push({
        key: msg.key || null,
        value: JSON.stringify(msg.value),
      });
      return acc;
    }, {} as Record<string, any[]>);

    const topicMessages = Object.entries(grouped).map(([topic, msgs]) => ({
      topic,
      messages: msgs,
    }));

    await this.producer.sendBatch({ topicMessages });
  }
}
