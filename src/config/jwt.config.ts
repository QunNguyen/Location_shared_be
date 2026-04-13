import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_SECRET || 'jwt-access-secret',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'jwt-refresh-secret',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
}));
