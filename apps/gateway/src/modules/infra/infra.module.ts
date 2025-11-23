// src/modules/infra/infra.module.ts
import { Module } from '@nestjs/common';
import { KafkaModule } from '@/modules/infra/kafka/kafka.module';
import { ObjectStorageModule } from '@/modules/infra/object-storage/object-storage.module';
import { GraphqlModule } from '@/modules/infra/graphql/graphql.module';
import { PubSubModule } from '@/modules/infra/pubsub/pubsub.module';
import { DatabaseModule } from '@/modules/infra/database/database.module';
import { OutboxModule } from '@/modules/infra/outbox/outbox.module';

@Module({
  imports: [
    DatabaseModule,
    KafkaModule,
    ObjectStorageModule,
    GraphqlModule,
    PubSubModule,
    OutboxModule,
  ],
  exports: [
    DatabaseModule,
    KafkaModule,
    ObjectStorageModule,
    GraphqlModule,
    PubSubModule,
    OutboxModule,
  ],
})
export class InfraModule {}
