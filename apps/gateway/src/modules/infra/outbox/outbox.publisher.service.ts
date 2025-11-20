// infra/kafka/outbox.publisher.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { KafkaService } from '../kafka/kafka.service';
import { OutboxRepository } from './outbox.repository';

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly BATCH_SIZE = 50;

  constructor(
    private readonly kafka: KafkaService,
    private readonly outboxRepo: OutboxRepository,
  ) {}

  @Interval(1000) // 1초마다 폴링 (나중에 튜닝)
  async pollAndPublish() {
    // pending + next_attempt_at <= now() 인 애들 lock 걸어서 가져오기
    const rows = await this.outboxRepo.lockPendingBatch(this.BATCH_SIZE);
    if (!rows.length) return;

    for (const row of rows) {
      try {
        if (row.payload_json === null || typeof row.payload_json !== 'object') {
          this.logger.error(
            `Outbox payload_json has invalid type (id=${row.id}, type=${typeof row.payload_json})`,
          );
          await this.outboxRepo.markFailed(row.id, new Error('Invalid payload_json type'));
          continue;
        }

        const correlationId: string | undefined = row.key ?? row.job_id ?? undefined;
        await this.kafka.produce(row.topic, row.payload_json, correlationId);

        await this.outboxRepo.markPublished(row.id);
      } catch (err) {
        await this.outboxRepo.markFailed(row.id, err);
      }
    }
  }
}
