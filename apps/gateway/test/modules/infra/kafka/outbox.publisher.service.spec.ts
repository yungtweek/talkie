import { OutboxPublisherService } from '@/modules/infra/outbox/outbox.publisher.service';
import { OutboxRepository } from '@/modules/infra/outbox/outbox.repository';
import { KafkaService } from '@/modules/infra/kafka/kafka.service';

describe('OutboxPublisherService', () => {
  let service: OutboxPublisherService;

  let mockOutboxRepo: {
    lockPendingBatch: jest.Mock;
    markPublished: jest.Mock;
    markFailed: jest.Mock;
  };

  let mockKafka: {
    produce: jest.Mock;
  };

  beforeEach(() => {
    mockOutboxRepo = {
      lockPendingBatch: jest.fn(),
      markPublished: jest.fn(),
      markFailed: jest.fn(),
    };

    mockKafka = {
      produce: jest.fn(),
    };

    service = new OutboxPublisherService(
      mockKafka as unknown as KafkaService,
      mockOutboxRepo as unknown as OutboxRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when no pending outbox rows exist', async () => {
    mockOutboxRepo.lockPendingBatch.mockResolvedValue([]);

    await service.pollAndPublish();

    expect(mockOutboxRepo.lockPendingBatch).toHaveBeenCalledTimes(1);
    expect(mockKafka.produce).not.toHaveBeenCalled();
    expect(mockOutboxRepo.markPublished).not.toHaveBeenCalled();
    expect(mockOutboxRepo.markFailed).not.toHaveBeenCalled();
  });

  it('produces Kafka messages and marks rows as published', async () => {
    const rows = [
      {
        id: 1,
        topic: 'chat.request',
        key: 'job-123',
        payload_json: { foo: 'bar' },
        job_id: 'job-123',
      },
    ];

    mockOutboxRepo.lockPendingBatch.mockResolvedValue(rows);
    mockKafka.produce.mockResolvedValue(undefined);

    await service.pollAndPublish();

    expect(mockKafka.produce).toHaveBeenCalledTimes(1);
    expect(mockKafka.produce).toHaveBeenCalledWith(
      'chat.request',
      expect.objectContaining({
        foo: 'bar',
        outboxPublishedAt: expect.any(String),
      }),
      'job-123',
    );

    expect(mockOutboxRepo.markPublished).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepo.markPublished).toHaveBeenCalledWith(1);
  });

  it('marks rows as failed when Kafka produce throws', async () => {
    const rows = [
      {
        id: 10,
        topic: 'chat.title.generate',
        key: 'job-555',
        payload_json: { hello: 'world' },
        job_id: 'job-555',
      },
    ];

    const error = new Error('produce failed');

    mockOutboxRepo.lockPendingBatch.mockResolvedValue(rows);
    mockKafka.produce.mockRejectedValue(error);

    await service.pollAndPublish();

    expect(mockKafka.produce).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepo.markFailed).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepo.markFailed).toHaveBeenCalledWith(10, error);
  });

  it('skips invalid payload_json values and marks them as failed', async () => {
    const rows = [
      {
        id: 99,
        topic: 'chat.request',
        key: 'job-999',
        payload_json: 'not-an-object', // invalid payload
        job_id: 'job-999',
      },
    ];

    mockOutboxRepo.lockPendingBatch.mockResolvedValue(rows);

    await service.pollAndPublish();

    expect(mockKafka.produce).not.toHaveBeenCalled();
    expect(mockOutboxRepo.markFailed).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepo.markFailed.mock.calls[0][0]).toBe(99);
  });
});
