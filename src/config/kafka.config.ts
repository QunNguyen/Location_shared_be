import { registerAs } from '@nestjs/config';

export default registerAs('kafka', () => ({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  clientId: process.env.KAFKA_CLIENT_ID || 'location-shared',
  groupId: process.env.KAFKA_GROUP_ID || 'location-shared-group',
}));
