import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseConfig } from './config/database.config.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { GameModule } from './game/game.module.js';
import { MatchmakingModule } from './matchmaking/matchmaking.module.js';
import { EmailModule } from './email/email.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    EmailModule,
    AuthModule,
    UsersModule,
    GameModule,
    MatchmakingModule,
  ],
})
export class AppModule {}
