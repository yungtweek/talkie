// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './modules/chat/chat.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { IngestModule } from '@/modules/ingest/ingest.module';
import { InfraModule } from '@/modules/infra/infra.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'], // apps/gateway 기준
    }),
    ScheduleModule.forRoot(),
    InfraModule,
    AuthModule,
    ChatModule,
    IngestModule,
  ],
})
export class AppModule {}
