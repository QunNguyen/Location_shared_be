import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Consumer,
  EachMessagePayload,
  Kafka,
  KafkaMessage,
} from 'kafkajs';
import { KAFKA_TOPICS } from './kafka.producer.service';

type MessageHandler = (payload: EachMessagePayload) => Promise<void>;

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private readonly handlers: Map<string, MessageHandler> = new Map();

  constructor(private configService: ConfigService) {
    this.kafka = new Kafka({
      clientId: this.configService.get<string>('kafka.clientId'),
      brokers: this.configService.get<string[]>('kafka.brokers'),
      retry: { retries: 8 },
    });

    this.consumer = this.kafka.consumer({
      groupId: this.configService.get<string>('kafka.groupId'),
      heartbeatInterval: 3000,
      sessionTimeout: 30000,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();

      // Register all topic subscriptions
      const topics = Object.values(KAFKA_TOPICS);
      for (const topic of topics) {
        await this.consumer.subscribe({ topic, fromBeginning: false });
      }

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          const { topic } = payload;
          const handler = this.handlers.get(topic);
          if (handler) {
            try {
              await handler(payload);
            } catch (error) {
              this.logger.error(
                `Error handling message on topic ${topic}`,
                error.message,
              );
            }
          }
        },
      });

      this.logger.log('Kafka consumer connected and running');
    } catch (error) {
      this.logger.error('Failed to connect Kafka consumer', error.message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  /**
   * Register a handler for a specific topic
   */
  on(topic: string, handler: MessageHandler): void {
    this.handlers.set(topic, handler);
  }

  /**
   * Parse JSON message value safely
   */
  parseMessage<T>(message: KafkaMessage): T | null {
    try {
      return JSON.parse(message.value?.toString() || '') as T;
    } catch {
      return null;
    }
  }
}
