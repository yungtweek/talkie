// infra/kafka/outbox.publisher.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { OutboxRepository } from './outbox.repository';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly BATCH_SIZE = 50;

  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isShuttingDown = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly kafka: KafkaService,
    private readonly outboxRepo: OutboxRepository,
  ) {}

  onModuleInit() {
    // NOTE: @Interval is convenient but can still fire while other providers (e.g., pg Pool) are tearing down.
    // We manage our own timer so we can stop it deterministically during shutdown.
    this.timer = setInterval(() => {
      if (this.isShuttingDown) return;
      if (this.isRunning) return; // prevent overlapping polls

      this.isRunning = true;
      this.inFlight = this.pollAndPublishOnce()
        .catch((err) => {
          this.logger.error('Outbox pollAndPublishOnce failed', err);
        })
        .finally(() => {
          this.isRunning = false;
          this.inFlight = null;
        });
    }, 1000);
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Wait for an in-flight poll to finish so we don't touch DB after pool teardown.
    if (this.inFlight) {
      try {
        await this.inFlight;
      } catch {
        // already logged
      }
    }
  }

  async pollAndPublish() {
    await this.pollAndPublishOnce();
  }

  private async pollAndPublishOnce() {
    if (this.isShuttingDown) return;

    // pending + next_attempt_at <= now() 인 애들 lock 걸어서 가져오기
    const rows = await this.outboxRepo.lockPendingBatch(this.BATCH_SIZE);
    if (!rows.length) return;

    for (const row of rows) {
      if (this.isShuttingDown) return;

      try {
        if (row.payload_json === null || typeof row.payload_json !== 'object') {
          this.logger.error(
            `Outbox payload_json has invalid type (id=${row.id}, type=${typeof row.payload_json})`,
          );
          await this.outboxRepo.markFailed(row.id, new Error('Invalid payload_json type'));
          continue;
        }

        const correlationId: string | undefined = row.key ?? row.job_id ?? undefined;
        const publishedAt =
          row.last_attempt_at instanceof Date
            ? row.last_attempt_at.toISOString()
            : row.last_attempt_at
              ? new Date(row.last_attempt_at).toISOString()
              : new Date().toISOString();
        const payload = {
          ...(row.payload_json as Record<string, unknown>),
          outboxPublishedAt: publishedAt,
        };
        await this.kafka.produce(row.topic, payload, correlationId);

        await this.outboxRepo.markPublished(row.id);
      } catch (err) {
        await this.outboxRepo.markFailed(row.id, err as any);
      }
    }
  }
}
