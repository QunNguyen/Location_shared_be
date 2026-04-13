import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatRepository } from './chat.repository';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { UserConversation, UserConversationSchema } from './schemas/user-conversation.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Block, BlockSchema } from '../user/schemas/block.schema';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: UserConversation.name, schema: UserConversationSchema },
      { name: User.name, schema: UserSchema },
      { name: Block.name, schema: BlockSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: { expiresIn: config.get<string>('jwt.accessExpiresIn') },
      }),
    }),
    UserModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatRepository],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
