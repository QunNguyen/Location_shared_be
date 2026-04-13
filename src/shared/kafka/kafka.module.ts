import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaProducerService } from './kafka.producer.service';
import { KafkaConsumerService } from './kafka.consumer.service';
import { EmailConsumerService } from './email.consumer.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [KafkaProducerService, KafkaConsumerService, EmailConsumerService],
  exports: [KafkaProducerService, KafkaConsumerService, EmailConsumerService],
})
export class KafkaModule {}
