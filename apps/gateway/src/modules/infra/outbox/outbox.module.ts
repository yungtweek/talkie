import { Global, Module } from '@nestjs/common';
import { OutboxPublisherService } from '@/modules/infra/outbox/outbox.publisher.service';
import { KafkaModule } from '@/modules/infra/kafka/kafka.module';
import { OutboxRepository } from '@/modules/infra/outbox/outbox.repository';

@Global()
@Module({
  imports: [KafkaModule],
  providers: [OutboxRepository, OutboxPublisherService],
  exports: [OutboxRepository],
})
export class OutboxModule {}
